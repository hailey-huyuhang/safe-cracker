import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CrackResult, CrackSafeService, StreamEvent } from './crack-safe.service';
import { SoundService } from './sound.service';

type Status = 'idle' | 'cracking' | 'cracked' | 'error';

interface Probe {
  attempt: number;
  digits: string[];
  matches: number;
}

interface HistoryEntry extends CrackResult {
  combination: string;
  live: boolean;
}

const STATUS_LABEL: Record<Status, string> = {
  idle: 'Waiting for a combination',
  cracking: 'Cracking…',
  cracked: 'Cracked',
  error: 'Failed',
};

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly api = inject(CrackSafeService);
  /** The sound tool, audibly: a beep per probe and a jingle when the safe opens. */
  protected readonly sound = inject(SoundService);

  /** The form: one input that must be exactly 10 digits. */
  readonly form = new FormGroup({
    combination: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[0-9]{10}$/)],
    }),
  });

  /** The single form control, used by the template and the tests. */
  get combination() {
    return this.form.controls.combination;
  }

  /** When on, the UI uses the streaming endpoint and shows every attempt as it happens. */
  readonly liveMode = signal(true);

  readonly status = signal<Status>('idle');
  readonly attempts = signal(0);
  readonly currentGuess = signal<string | null>(null);
  readonly currentMatches = signal<number | null>(null);
  readonly target = signal('');
  readonly result = signal<CrackResult | null>(null);
  readonly probes = signal<Probe[]>([]);
  readonly history = signal<HistoryEntry[]>([]);
  readonly error = signal<string | null>(null);

  readonly busy = computed(() => this.status() === 'cracking');
  readonly statusLabel = computed(() => STATUS_LABEL[this.status()]);

  /** The 10 cells of the dial: the digit being tried and whether it is in the right place. */
  readonly cells = computed(() => {
    const guess = this.currentGuess();
    const target = this.target();
    return Array.from({ length: 10 }, (_, i) => ({
      char: guess ? guess[i] : '·',
      hit: guess !== null && guess[i] === target[i],
    }));
  });

  randomize(): void {
    const digits = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10));
    this.combination.setValue(digits.join(''));
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    if (this.combination.invalid) {
      this.combination.markAsTouched();
      return;
    }
    const combination = this.combination.value;
    const live = this.liveMode();
    this.sound.unlock(); // we are inside the submit click, the one place a browser lets audio start
    this.start(combination);

    try {
      const result = live
        ? await this.api.crackLive(combination, (event) => this.onEvent(event))
        : await this.api.crack(combination);
      this.finish(combination, result, live);
    } catch (err) {
      this.status.set('error');
      this.error.set(err instanceof Error ? err.message : String(err));
      this.sound.failure();
    }
  }

  private start(combination: string): void {
    this.status.set('cracking');
    this.target.set(combination);
    this.attempts.set(0);
    this.currentGuess.set(null);
    this.currentMatches.set(null);
    this.result.set(null);
    this.probes.set([]);
    this.error.set(null);
  }

  /** One sound-tool call reported by the backend: advance the counter and the dial. */
  private onEvent(event: StreamEvent): void {
    if (event.event !== 'attempt') return;
    this.attempts.set(event.attempt);
    this.currentGuess.set(event.guess);
    this.currentMatches.set(event.matches);
    this.sound.beep(event.matches);
    this.probes.update((probes) => [
      ...probes,
      { attempt: event.attempt, digits: event.guess.split(''), matches: event.matches },
    ]);
  }

  private finish(combination: string, result: CrackResult, live: boolean): void {
    this.attempts.set(result.attempts);
    this.currentGuess.set(combination); // the final, verified guess is the combination itself
    this.currentMatches.set(10);
    this.result.set(result);
    this.status.set('cracked');
    this.sound.success();
    this.history.update((entries) => [{ combination, live, ...result }, ...entries].slice(0, 10));
  }
}

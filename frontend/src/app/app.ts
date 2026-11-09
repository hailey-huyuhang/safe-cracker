import { DecimalPipe } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CelebrationService } from './celebration.service';
import { CrackResult, CrackSafeService, StreamEvent } from './crack-safe.service';
import { SolverInference } from './inference';
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

/** Delay between streamed attempts, so beeps and the dial stay readable. */
const PACE_MS = { fast: 40, normal: 120, slow: 300 } as const;
type Pace = keyof typeof PACE_MS;

const DOOR_DELAY_MS = 600; // let the last digits unlock before the door swings open
const BURST_DELAY_MS = 350; // confetti once the door is well on its way

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly api = inject(CrackSafeService);
  /** The sound tool, audibly: a beep per probe, a click per solved digit, a jingle when the safe opens. */
  protected readonly sound = inject(SoundService);
  /** Confetti and vault loot across the screen when the safe opens. */
  private readonly celebration = inject(CelebrationService);
  private readonly vault = viewChild<ElementRef<HTMLElement>>('vault');

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
  /** How fast the live view plays back the probes. */
  readonly pace = signal<Pace>('normal');
  readonly paces = Object.keys(PACE_MS) as Pace[];

  readonly status = signal<Status>('idle');
  readonly attempts = signal(0);
  readonly currentGuess = signal<string | null>(null);
  readonly currentMatches = signal<number | null>(null);
  readonly target = signal('');
  readonly result = signal<CrackResult | null>(null);
  readonly probes = signal<Probe[]>([]);
  readonly history = signal<HistoryEntry[]>([]);
  readonly error = signal<string | null>(null);
  /** The digit the solver has settled for each position (see SolverInference), null while open. */
  readonly solved = signal<(number | null)[]>(Array(10).fill(null));
  /** The position the solver is working on right now. */
  readonly probing = signal<number | null>(null);
  /** The vault door swings open a moment after the last digit locks. */
  readonly doorOpen = signal(false);

  readonly busy = computed(() => this.status() === 'cracking');
  readonly statusLabel = computed(() => STATUS_LABEL[this.status()]);

  /**
   * The 10 cells of the dial: a solved cell shows the settled digit, an open
   * one the digit currently being tried, highlighted when it is in place.
   */
  readonly cells = computed(() => {
    const guess = this.currentGuess();
    const target = this.target();
    const solved = this.solved();
    const probing = this.probing();
    return Array.from({ length: 10 }, (_, i) => {
      const known = solved[i];
      return {
        char: known !== null ? String(known) : guess ? guess[i] : '·',
        hit: known === null && guess !== null && guess[i] === target[i],
        solved: known !== null,
        probing: probing === i,
      };
    });
  });

  private inference = new SolverInference();
  private timers: ReturnType<typeof setTimeout>[] = [];

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
        ? await this.api.crackLive(combination, (event) => this.onEvent(event), PACE_MS[this.pace()])
        : await this.api.crack(combination);
      this.finish(combination, result, live);
    } catch (err) {
      this.status.set('error');
      this.error.set(err instanceof Error ? err.message : String(err));
      this.sound.failure();
    }
  }

  private start(combination: string): void {
    this.clearTimers();
    this.inference = new SolverInference();
    this.status.set('cracking');
    this.target.set(combination);
    this.attempts.set(0);
    this.currentGuess.set(null);
    this.currentMatches.set(null);
    this.result.set(null);
    this.probes.set([]);
    this.error.set(null);
    this.solved.set(Array(10).fill(null));
    this.probing.set(null);
    this.doorOpen.set(false);
  }

  /** One sound-tool call reported by the backend: advance the counter, the dial and the inference. */
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
    this.settlePositions(this.inference.observe(event.guess, event.matches));
  }

  private finish(combination: string, result: CrackResult, live: boolean): void {
    this.attempts.set(result.attempts);
    this.currentGuess.set(combination); // the final, verified guess is the combination itself
    this.currentMatches.set(10);
    this.settlePositions(this.inference.finish(combination));
    this.result.set(result);
    this.status.set('cracked');
    this.history.update((entries) => [{ combination, live, ...result }, ...entries].slice(0, 10));
    this.after(DOOR_DELAY_MS, () => {
      this.doorOpen.set(true);
      this.sound.success();
    });
    this.after(DOOR_DELAY_MS + BURST_DELAY_MS, () =>
      this.celebration.burst(this.vault()?.nativeElement.getBoundingClientRect()),
    );
  }

  /** Positions the solver has just become certain about: their cells unlock with a click. */
  private settlePositions(positions: number[]): void {
    this.probing.set(this.inference.probing);
    if (positions.length === 0) return;
    this.solved.set([...this.inference.known]);
    this.sound.click();
  }

  private after(ms: number, run: () => void): void {
    this.timers.push(setTimeout(run, ms));
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

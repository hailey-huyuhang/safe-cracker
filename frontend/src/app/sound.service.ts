import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'safe-cracker.sound';

/**
 * The jingle played when the safe opens, as [note, length in beats].
 * Change this list to pick your own tune; BEAT_MS sets the tempo.
 */
export const SUCCESS_MELODY: ReadonlyArray<readonly [string, number]> = [
  ['C5', 1],
  ['E5', 1],
  ['G5', 1],
  ['C6', 3],
];
export const BEAT_MS = 90;

/**
 * Makes the "sound tool" audible. Every probe plays a short beep whose pitch
 * rises with the number of digits in place (0 → A3, two semitones per digit),
 * and opening the safe plays SUCCESS_MELODY. Everything is synthesised with the
 * Web Audio API, so no audio files are involved. The mute switch is remembered
 * in localStorage, and visitors who asked their OS for reduced motion start
 * muted.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  readonly muted = signal(initialMuted());
  private context: AudioContext | null = null;

  /** Browsers only let a page start audio from a user gesture, so call this from the submit click. */
  unlock(): void {
    if (this.muted() || typeof AudioContext === 'undefined') return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }

  toggle(): void {
    this.muted.update((muted) => !muted);
    try {
      localStorage.setItem(STORAGE_KEY, this.muted() ? 'off' : 'on');
    } catch {
      // storage disabled (private mode etc.): the choice just is not remembered
    }
    this.unlock();
  }

  /** One sound-tool answer: the more digits in place, the higher the beep. */
  beep(matches: number): void {
    this.tone(frequencyFor(matches), 0, 0.06, 0.18);
  }

  /** The safe is open. */
  success(): void {
    let at = 0;
    for (const [note, beats] of SUCCESS_MELODY) {
      const seconds = (beats * BEAT_MS) / 1000;
      this.tone(noteFrequency(note), at, seconds * 1.1, 0.22);
      at += seconds;
    }
  }

  /** A position clicking into place. */
  click(): void {
    this.tone(noteFrequency('A6'), 0.03, 0.025, 0.1, 'square');
  }

  /** Something went wrong: one low buzz. */
  failure(): void {
    this.tone(noteFrequency('C3'), 0, 0.25, 0.2, 'triangle');
  }

  private tone(
    frequency: number,
    delay: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
  ): void {
    const ctx = this.muted() ? null : this.context;
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}

/** 0 digits in place → A3 (220 Hz); every extra digit raises the pitch by two semitones. */
export function frequencyFor(matches: number): number {
  const digits = Math.max(0, Math.min(10, matches));
  return 220 * 2 ** ((2 * digits) / 12);
}

const SEMITONES_FROM_A: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** Frequency of a note name such as "C5", "F#4" or "Bb3" (A4 = 440 Hz). */
export function noteFrequency(name: string): number {
  const match = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!match) throw new Error(`Not a note name: ${name}`);
  const [, letter, accidental, octave] = match;
  const semitones =
    SEMITONES_FROM_A[letter] +
    (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) +
    (Number(octave) - 4) * 12;
  return 440 * 2 ** (semitones / 12);
}

function initialMuted(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'off') return true;
    if (stored === 'on') return false;
  } catch {
    // storage unavailable: fall through to the OS preference
  }
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

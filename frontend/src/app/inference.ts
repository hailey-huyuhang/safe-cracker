/**
 * Follows the solver's reasoning from the outside, using nothing but the
 * guesses it makes and the sound tool's answers, so the UI can show each
 * position clicking into place the moment the solver actually knows it.
 *
 * It mirrors backend/cracker.py. The all-same-digit guesses at the start give
 * the count of every digit (9's count is whatever is left). Then, with the most
 * frequent digit b as the baseline, every probe changes one position to some
 * digit d, and the score moves by +1 (that position is d), −1 (it is b) or 0
 * (it is neither, so both are ruled out). A position whose candidates have
 * shrunk to a single digit, including by the leftover counts alone, needs no
 * probe at all.
 */
export class SolverInference {
  /** The digit known for each position, or null while that position is still open. */
  readonly known: (number | null)[] = Array(10).fill(null);
  /** The position the solver is working on right now, or null (counting phase, or all done). */
  probing: number | null = null;

  private phase: 'counting' | 'probing' = 'counting';
  private readonly counts: number[] = Array(10).fill(0);
  private total = 0;
  private baseline = 0;
  private remaining: number[] = [];
  private position = 0;
  private candidates: number[] = [];

  /** Feed one guess and its score; returns the positions that just became certain, in order. */
  observe(guess: string, matches: number): number[] {
    const newlyKnown: number[] = [];
    if (this.phase === 'counting') {
      if (isAllSame(guess)) {
        const digit = Number(guess[0]);
        this.counts[digit] = matches;
        this.total += matches;
        return newlyKnown;
      }
      // The first single-position probe means the counting phase is over.
      this.counts[9] = 10 - this.total;
      this.baseline = this.counts.indexOf(Math.max(...this.counts));
      this.remaining = [...this.counts];
      this.phase = 'probing';
      this.open(0, newlyKnown);
    }
    if (this.position < 10 && probedPosition(guess, this.baseline) === this.position) {
      const digit = Number(guess[this.position]);
      const delta = matches - this.counts[this.baseline];
      if (delta === 1) {
        this.candidates = [digit];
      } else if (delta === -1) {
        this.candidates = [this.baseline];
      } else {
        this.candidates = this.candidates.filter((c) => c !== digit && c !== this.baseline);
      }
      this.settle(newlyKnown);
    }
    return newlyKnown;
  }

  /** The verified combination: settle whatever was still open (the all-same-digit edge case). */
  finish(combination: string): number[] {
    const newlyKnown: number[] = [];
    for (let i = 0; i < 10; i++) {
      if (this.known[i] === null) {
        this.known[i] = Number(combination[i]);
        newlyKnown.push(i);
      }
    }
    this.position = 10;
    this.probing = null;
    return newlyKnown;
  }

  private open(position: number, newlyKnown: number[]): void {
    this.position = position;
    this.candidates = this.openCandidates();
    this.settle(newlyKnown);
  }

  /** Settle the current position once a single candidate is left, and keep going while that stays true. */
  private settle(newlyKnown: number[]): void {
    while (this.position < 10 && this.candidates.length === 1) {
      const digit = this.candidates[0];
      this.known[this.position] = digit;
      this.remaining[digit] -= 1;
      newlyKnown.push(this.position);
      this.position += 1;
      this.candidates = this.position < 10 ? this.openCandidates() : [];
    }
    this.probing = this.position < 10 ? this.position : null;
  }

  private openCandidates(): number[] {
    return this.remaining.flatMap((count, digit) => (count > 0 ? [digit] : []));
  }
}

function isAllSame(guess: string): boolean {
  return guess.split('').every((ch) => ch === guess[0]);
}

/** The one position where the guess differs from the all-baseline guess, or −1. */
function probedPosition(guess: string, baseline: number): number {
  let found = -1;
  for (let i = 0; i < guess.length; i++) {
    if (Number(guess[i]) !== baseline) {
      if (found !== -1) return -1;
      found = i;
    }
  }
  return found;
}

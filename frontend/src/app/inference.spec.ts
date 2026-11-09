import { SolverInference } from './inference';
import { PROBES } from './inference.fixtures';

describe('SolverInference', () => {
  for (const [combination, probes] of Object.entries(PROBES)) {
    it(`settles ${combination} from left to right and is never wrong along the way`, () => {
      const inference = new SolverInference();
      let knownSoFar = 0;
      for (const [guess, matches] of probes) {
        const newly = inference.observe(guess, matches);
        expect(newly).toEqual(newly.map((_, k) => knownSoFar + k));
        knownSoFar += newly.length;
        inference.known.forEach((digit, i) => {
          if (digit !== null) expect(digit).toBe(Number(combination[i]));
        });
      }
      inference.finish(combination);
      expect(inference.known.join('')).toBe(combination);
      expect(inference.probing).toBeNull();
    });
  }

  it('knows every position before the final verification guess', () => {
    const inference = new SolverInference();
    for (const [guess, matches] of PROBES['4827163950'].slice(0, -1)) {
      inference.observe(guess, matches);
    }
    expect(inference.known.every((digit) => digit !== null)).toBe(true);
    expect(inference.probing).toBeNull();
  });

  it('reports which position is being worked on', () => {
    const inference = new SolverInference();
    const probes = PROBES['4827163950'];
    for (const [guess, matches] of probes.slice(0, 9)) inference.observe(guess, matches); // counting phase
    expect(inference.probing).toBeNull();
    inference.observe(...probes[9]); // first single-position probe
    expect(inference.probing).toBe(0);
  });
});

import { TestBed } from '@angular/core/testing';

import { SoundService, frequencyFor, noteFrequency } from './sound.service';

describe('SoundService', () => {
  beforeEach(() => localStorage.clear());

  it('raises the beep with every digit in place', () => {
    const pitches = Array.from({ length: 11 }, (_, matches) => frequencyFor(matches));
    for (let i = 1; i < pitches.length; i++) {
      expect(pitches[i]).toBeGreaterThan(pitches[i - 1]);
    }
    expect(pitches[0]).toBeCloseTo(220, 5);
    expect(frequencyFor(99)).toBe(pitches[10]);
  });

  it('turns note names into frequencies', () => {
    expect(noteFrequency('A4')).toBeCloseTo(440, 5);
    expect(noteFrequency('C5')).toBeCloseTo(523.25, 1);
    expect(noteFrequency('F#4')).toBeCloseTo(369.99, 1);
    expect(noteFrequency('Bb3')).toBeCloseTo(233.08, 1);
    expect(() => noteFrequency('H2')).toThrow();
  });

  it('remembers the mute switch', () => {
    const sound = TestBed.inject(SoundService);
    const before = sound.muted();
    sound.toggle();
    expect(sound.muted()).toBe(!before);
    expect(localStorage.getItem('safe-cracker.sound')).toBe(sound.muted() ? 'off' : 'on');
  });

  it('stays silent where there is no Web Audio (jsdom) without throwing', () => {
    const sound = TestBed.inject(SoundService);
    expect(() => {
      sound.unlock();
      sound.beep(5);
      sound.success();
      sound.failure();
    }).not.toThrow();
  });
});

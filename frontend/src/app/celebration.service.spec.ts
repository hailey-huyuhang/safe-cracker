import { TestBed } from '@angular/core/testing';

import { CelebrationService } from './celebration.service';

describe('CelebrationService', () => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = getContext;
    window.matchMedia = originalMatchMedia;
    document.querySelectorAll('canvas.celebration').forEach((c) => c.remove());
  });

  it('skips the animation where the canvas cannot draw (jsdom) without throwing', () => {
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof getContext;
    const celebration = TestBed.inject(CelebrationService);
    expect(() => celebration.burst()).not.toThrow();
    expect(document.querySelector('canvas.celebration')).toBeNull();
  });

  it('respects prefers-reduced-motion', () => {
    let contextRequested = false;
    HTMLCanvasElement.prototype.getContext = (() => {
      contextRequested = true;
      return null;
    }) as typeof getContext;
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    TestBed.inject(CelebrationService).burst();
    expect(contextRequested).toBe(false);
    expect(document.querySelector('canvas.celebration')).toBeNull();
  });
});

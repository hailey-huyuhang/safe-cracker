import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

const COLORS = ['#5eead4', '#34d399', '#a78bfa', '#f472b6', '#fbbf24', '#e8ecf8'];
const LOOT = ['🪙', '💵', '💎', '🔓'];
const DURATION_MS = 4200;
const GRAVITY = 0.0011; // px per ms² (a lazy fall so the loot can be recognised)
const DRAG = 0.0006; // fraction of velocity lost per ms

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  flutter: number;
  size: number;
  color: string;
  glyph: string | null;
}

/**
 * The celebration when the safe opens: two cannons fire a full-screen burst
 * of confetti mixed with vault loot (coins, bills, gems, an open padlock),
 * drawn on a canvas overlay for a few seconds. Given the vault's rectangle
 * they fire out of the open door; otherwise from the bottom corners. No library,
 * no image assets, and nothing happens for visitors who asked their OS for
 * reduced motion.
 */
@Injectable({ providedIn: 'root' })
export class CelebrationService {
  private readonly document = inject(DOCUMENT);
  private stopCurrent: (() => void) | null = null;

  burst(origin?: DOMRect): void {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const win = this.document.defaultView;
    if (!win) return;
    this.stopCurrent?.();

    const canvas = this.document.createElement('canvas');
    canvas.className = 'celebration';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = win.innerWidth;
    const height = win.innerHeight;
    const dpr = win.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    this.document.body.appendChild(canvas);

    const particles = origin
      ? [
          ...cannon(origin.left + origin.width * 0.3, origin.top + origin.height * 0.6, -Math.PI / 2 - 0.5, height * 0.6, 1),
          ...cannon(origin.left + origin.width * 0.7, origin.top + origin.height * 0.6, -Math.PI / 2 + 0.5, height * 0.6, 1),
        ]
      : [
          ...cannon(width * 0.08, height, -Math.PI / 3, height * 0.9),
          ...cannon(width * 0.92, height, (-2 * Math.PI) / 3, height * 0.9),
        ];

    let frame = 0;
    let last = win.performance.now();
    const started = last;
    const step = (now: number) => {
      const dt = Math.min(32, now - last);
      last = now;
      const elapsed = now - started;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = elapsed > DURATION_MS * 0.7 ? 1 - (elapsed - DURATION_MS * 0.7) / (DURATION_MS * 0.3) : 1;
      for (const p of particles) {
        p.vy += GRAVITY * (p.glyph ? 0.8 : 1) * dt; // loot floats a little longer than paper
        p.vx *= 1 - DRAG * dt;
        p.vy *= 1 - DRAG * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;
        p.flutter += dt * 0.012;
        draw(ctx, p);
      }
      if (elapsed < DURATION_MS) {
        frame = win.requestAnimationFrame(step);
      } else {
        stop();
      }
    };
    const stop = () => {
      win.cancelAnimationFrame(frame);
      canvas.remove();
      if (this.stopCurrent === stop) this.stopCurrent = null;
    };
    this.stopCurrent = stop;
    frame = win.requestAnimationFrame(step);
  }
}

/** Particles fired from (x, y) around `angle` (radians, −π/2 is straight up), fast enough to fly `reach` pixels up. */
function cannon(x: number, y: number, angle: number, reach: number, spread = 0.7): Particle[] {
  const particles: Particle[] = [];
  const peakSpeed = Math.sqrt(2 * GRAVITY * reach);
  for (let i = 0; i < 110; i++) {
    const glyph = i < 14 ? LOOT[i % LOOT.length] : null;
    const direction = angle + (Math.random() - 0.5) * spread;
    const speed = peakSpeed * (0.55 + Math.random() * 0.5);
    particles.push({
      x,
      y,
      vx: Math.cos(direction) * speed,
      vy: Math.sin(direction) * speed,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * (glyph ? 0.008 : 0.02),
      flutter: Math.random() * Math.PI * 2,
      size: glyph ? 36 + Math.random() * 18 : 6 + Math.random() * 6,
      color: COLORS[i % COLORS.length],
      glyph,
    });
  }
  return particles;
}

function draw(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.glyph) {
    ctx.rotate(p.rotation * 0.3);
    ctx.font = `${p.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.glyph, 0, 0);
  } else {
    ctx.rotate(p.rotation);
    ctx.scale(Math.cos(p.flutter), 1); // a cheap way to make flat confetti look like it tumbles
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
  }
  ctx.restore();
}

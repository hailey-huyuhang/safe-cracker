import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Response of POST /api/crack_safe/: the two outputs of crack_safe. */
export interface CrackResult {
  attempts: number;
  time_taken: number;
}

/** One line of the NDJSON stream from POST /api/crack_safe/stream/. */
export type StreamEvent =
  | { event: 'attempt'; attempt: number; guess: string; matches: number }
  | { event: 'done'; attempts: number; time_taken: number }
  | { event: 'error'; message: string };

@Injectable({ providedIn: 'root' })
export class CrackSafeService {
  private readonly http = inject(HttpClient);

  /** Plain request: resolves once the safe has been cracked. */
  async crack(actualCombination: string): Promise<CrackResult> {
    try {
      return await firstValueFrom(
        this.http.post<CrackResult>('/api/crack_safe/', { actual_combination: actualCombination }),
      );
    } catch (err) {
      throw new Error(describe(err));
    }
  }

  /**
   * Streaming request: calls `onEvent` for every line the backend sends while
   * the solver runs, then resolves with the final result. This uses fetch
   * directly because HttpClient only emits once the whole body has arrived.
   */
  async crackLive(
    actualCombination: string,
    onEvent: (event: StreamEvent) => void,
    paceMs = 40,
  ): Promise<CrackResult> {
    const response = await fetch('/api/crack_safe/stream/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actual_combination: actualCombination, pace_ms: paceMs }),
    });
    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed with HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    let result: CrackResult | null = null;

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line) as StreamEvent;
        onEvent(event);
        if (event.event === 'done') {
          result = { attempts: event.attempts, time_taken: event.time_taken };
        } else if (event.event === 'error') {
          throw new Error(event.message);
        }
      }
    }
    if (!result) throw new Error('The stream ended before the safe was cracked.');
    return result;
  }
}

function describe(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Could not reach the backend. Is the Flask server running?';
    return err.error?.error ?? `Request failed with HTTP ${err.status}`;
  }
  return err instanceof Error ? err.message : String(err);
}

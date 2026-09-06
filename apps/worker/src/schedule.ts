import type { RepeatOptions } from 'bullmq';

export const CAIRO_TZ = 'Africa/Cairo';

/**
 * Every repeatable job runs on Cairo time — Egypt observes DST, so a UTC cron
 * drifts the 22:00 digest by an hour for half the year (CLAUDE.md — Conventions).
 * This helper makes the timezone impossible to forget; `assertCairoTz` is called
 * at registration so a repeat rule without it throws rather than misfiring in
 * November.
 */
export function repeatEvery(pattern: string): RepeatOptions {
  return { pattern, tz: CAIRO_TZ };
}

export function assertCairoTz(repeat: RepeatOptions): void {
  if (repeat.tz !== CAIRO_TZ) {
    throw new Error(`repeatable job must declare tz: '${CAIRO_TZ}', got '${String(repeat.tz)}'`);
  }
}

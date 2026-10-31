'use strict';

/* How a duration is written. Call times default to exact milliseconds, the
 * unit people optimise in; the Time format setting can switch them to seconds
 * and minutes. Every duration the Calls tab shows goes through
 * formatTime, so one setting decides them all.
 *
 * Pure: no DOM, no chrome.*. */

export const TIME_FORMATS = Object.freeze(['ms', 'human']);

const usable = (ms) => typeof ms === 'number' && Number.isFinite(ms) && ms > 0;

/* "1,240 ms": a fixed locale, so the figures read the same everywhere. */
export function formatMs(ms) {
  if (!usable(ms)) return '0 ms';
  return `${Math.round(ms).toLocaleString('en-US')} ms`;
}

/* A duration the way a person says it: "640 ms" under a second, "1.8 s" under
 * a minute, "1m 12s" above. Rounded first, so 999.6 ms is "1.0 s" and 59.96 s
 * is "1m 0s". */
export function formatDuration(ms) {
  if (!usable(ms)) return '0 ms';
  const whole = Math.round(ms);
  if (whole < 1000) return `${whole.toLocaleString('en-US')} ms`;
  const tenths = Math.round(ms / 100) / 10;
  if (tenths < 60) return `${tenths.toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/* format is 'human' or, for anything else, 'ms'. */
export function formatTime(ms, format) {
  return format === 'human' ? formatDuration(ms) : formatMs(ms);
}

/* The format a stored or typed value stands for: itself when it is one of
 * TIME_FORMATS, otherwise 'ms'. A remembered setting from another version, or
 * one edited by hand, must not leave the switch with neither side on. */
export function timeFormatOf(value) {
  return TIME_FORMATS.includes(value) ? value : 'ms';
}

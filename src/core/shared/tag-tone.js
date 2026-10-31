'use strict';

/* The tag family's colour logic, in one place: the tabs describe a marker with
 * a tone word of their own (a result is "good" or "bad", a size is "warn" or
 * "strong", a verdict is "estimated"), and the panel draws every marker with
 * the same variants, .tag-neutral / -ok / -warn / -error / -info, and one per
 * call type (Calls) so people can scan a list by colour:
 * .tag-type-ip (blue), .tag-type-dr (green), .tag-type-ra (violet, also for a
 * plain Apex call). Pure. */

const VARIANT = Object.freeze({
  neutral: 'neutral',
  good: 'ok',
  ok: 'ok',
  warn: 'warn',
  estimated: 'warn',
  bad: 'error',
  error: 'error',
  strong: 'error',
  info: 'info',
  // A call type, as the lower-case word of its type: Calls' type tag
  ip: 'type-ip',
  dr: 'type-dr',
  ra: 'type-ra',
  apex: 'type-ra'
});

/* The variant a tone word draws as; an unknown or missing tone is neutral, so
 * a marker is never left without a colour rule. */
export function tagVariant(tone) {
  return Object.prototype.hasOwnProperty.call(VARIANT, tone) ? VARIANT[tone] : 'neutral';
}

/* The class names of a marker: the box and its variant, e.g. "tag tag-ok". */
export function tagClasses(tone) {
  return `tag tag-${tagVariant(tone)}`;
}

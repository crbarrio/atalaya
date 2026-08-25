/**
 * `2026-08-18 14:17:29 +0000` → Date, or null.
 *
 * Built into a proper ISO string rather than handed to `new Date` as-is: the
 * offset stack writes is `+0000` and ISO wants `+00:00`. Parsing that leniently
 * is engine-dependent, and a date silently landing on the wrong day is worse
 * than no date at all.
 */
const STACK_DATE =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\s*([+-])(\d{2}):?(\d{2}))?$/;

export function parseStackDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const match = STACK_DATE.exec(value.trim());
  if (!match) return null;

  const [, day, time, sign, hours, minutes] = match;
  const offset = sign ? `${sign}${hours}:${minutes}` : 'Z';
  const date = new Date(`${day}T${time}${offset}`);

  return Number.isNaN(date.getTime()) ? null : date;
}

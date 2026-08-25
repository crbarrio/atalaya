import { Pipe, PipeTransform } from '@angular/core';

/**
 * `stack` timestamps ("2026-08-18 14:33:49") have no offset, and
 * `new Date(str)` parsing that shape is implementation-defined, not spec
 * guaranteed — same bug already fixed once in
 * inventory/parsers/stack-date.parser.ts. Manual parse here for the same
 * reason.
 */
const STACK_DATE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;

function parseTimestamp(value: string): Date | null {
  const match = STACK_DATE.exec(value.trim());
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    return new Date(+year, +month - 1, +day, +hour, +minute, +second);
  }
  // Falls back to the platform parser for genuine ISO strings (lastSeenAt,
  // manifestAt, deployedAt — real Date fields the backend serialises as ISO).
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

@Pipe({ name: 'relativeTime', pure: false })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    if (!value) return 'never';

    const date = value instanceof Date ? value : parseTimestamp(value);
    if (!date) return 'unknown';

    const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
}

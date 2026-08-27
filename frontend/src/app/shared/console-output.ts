import { ConsoleLine } from '../core/models/action.model';

/**
 * CSI and OSC escape sequences. `stack` colours its output, and running under
 * a pty makes `docker compose` add progress redraws on top — cursor moves,
 * line clears, hidden cursor. None of it means anything in a scrollback pane,
 * and left in it renders as visible garbage.
 */
const ANSI = /\[[0-9;?]*[ -/]*[@-~]|\][^]*(?:|\\)/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

/** Cap: a long `logs -f` would otherwise grow until the tab runs out of memory. */
export const MAX_LINES = 2000;

/**
 * Folds a chunk of output into the lines already on screen.
 *
 * Two things a naive split on `\n` gets wrong. A chunk can end mid-line, so
 * the tail has to stay open for the next chunk to continue — otherwise every
 * network boundary becomes a line break. And `\r` without `\n` is a progress
 * redraw: the writer means "replace what I just wrote", which is how
 * `docker compose` animates its spinners.
 */
export function appendChunk(
  lines: ConsoleLine[],
  chunk: string,
  stream: 'stdout' | 'stderr',
): ConsoleLine[] {
  // CRLF first: running under a pty turns every newline into `\r\n`, and the
  // redraw handling below treats a lone `\r` as "replace this line". Without
  // this, every line would be replaced by what follows it — which is to say,
  // by nothing.
  const text = stripAnsi(chunk).replace(/\r\n/g, '\n');
  if (!text) return lines;

  const next = [...lines];
  const segments = text.split('\n');

  segments.forEach((segment, index) => {
    // Only the last part of a `\r` run survives: the earlier ones were
    // overwritten on a real terminal before anyone saw them.
    const overwritten = segment.split('\r');
    const visible = overwritten[overwritten.length - 1];
    const redrawn = overwritten.length > 1;

    // Every segment but the last was followed by a real newline in the chunk.
    const closed = index < segments.length - 1;

    const open = next.length > 0 && !next[next.length - 1].closed
      ? next[next.length - 1]
      : undefined;

    if (open) {
      next[next.length - 1] = {
        ...open,
        text: redrawn ? visible : open.text + visible,
        closed,
      };
    } else if (visible || closed) {
      next.push({ text: visible, stream, closed });
    }
  });

  return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
}

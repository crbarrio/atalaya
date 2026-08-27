import { DestroyRef, inject, signal } from '@angular/core';

import {
  ActionCommand,
  ConsoleLine,
  RunState,
} from '../core/models/action.model';
import { ActionsService, RunOptions, StreamHandle } from '../core/services/actions.service';
import { appendChunk } from './console-output';

/**
 * One running command and its output, as signals.
 *
 * A helper rather than a service: two pages each want their own independent
 * console, and a `providedIn: 'root'` service would give them one shared
 * between them. Created with `commandRunner()` inside a component's injection
 * context, so it can tear the stream down when that component goes away.
 */
export interface CommandRunner {
  readonly lines: () => ConsoleLine[];
  readonly state: () => RunState;
  readonly exitCode: () => number | null;
  readonly error: () => string | null;
  readonly command: () => string | null;
  start(server: string, command: ActionCommand, options?: RunOptions): void;
  stop(): void;
  clear(): void;
}

export function commandRunner(): CommandRunner {
  const actions = inject(ActionsService);
  const destroyRef = inject(DestroyRef);

  const lines = signal<ConsoleLine[]>([]);
  const state = signal<RunState>('idle');
  const exitCode = signal<number | null>(null);
  const error = signal<string | null>(null);
  const command = signal<string | null>(null);

  let handle: StreamHandle | null = null;

  const stop = () => {
    handle?.stop();
    handle = null;
    // Stopping is a decision, not a failure: `logs` has no natural end, and
    // pressing Stop on it is the normal way to finish.
    if (state() === 'running') state.set('done');
  };

  // Navigating away closes the connection, which is what kills the remote
  // process. Without this a deploy would keep streaming into nothing.
  destroyRef.onDestroy(stop);

  return {
    lines,
    state,
    exitCode,
    error,
    command,
    stop,
    clear: () => {
      lines.set([]);
      exitCode.set(null);
      error.set(null);
      if (state() !== 'running') state.set('idle');
    },
    start: (server, cmd, options = {}) => {
      handle?.stop();
      lines.set([]);
      exitCode.set(null);
      error.set(null);
      state.set('running');
      command.set(options.instance ? `${cmd} ${options.instance}` : cmd);

      handle = actions.stream(server, cmd, options, {
        onEvent: (event) => {
          if (event.type === 'output') {
            lines.update((current) => appendChunk(current, event.text, event.stream));
            return;
          }
          exitCode.set(event.code);
          state.set(event.code === 0 ? 'done' : 'failed');
          handle = null;
        },
        onError: (message) => {
          error.set(message);
          state.set('failed');
          handle = null;
        },
      });
    },
  };
}

/** Mirrors the backend's `CommandEvent` (backend/src/shared/ssh/ssh.service.ts). */
export type CommandEvent =
  | { type: 'output'; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'exit'; code: number };

export type ActionCommand =
  | 'status'
  | 'versions'
  | 'logs'
  | 'deploy'
  | 'rollback'
  | 'start'
  | 'stop'
  | 'backup'
  | 'retire'
  | 'retireWithData';

/** One line as the console shows it, already split and stripped of ANSI. */
export interface ConsoleLine {
  text: string;
  stream: 'stdout' | 'stderr';
  /**
   * False while the writer has not ended the line yet. A chunk can stop
   * mid-line, and the next one continues it rather than starting a new one.
   */
  closed: boolean;
}

export type RunState = 'idle' | 'running' | 'done' | 'failed';

/** Mirrors the backend's `StackVersions` — `stack versions --json`. */
export interface StackVersions {
  instance: string;
  running: string | null;
  branch: string | null;
  /** What a bare deploy would pick. Equal to `running` means it would change nothing. */
  chosen: string | null;
  services: { image: string; versions: StackVersion[] }[];
}

export interface StackVersion {
  tag: string;
  published: boolean;
  size: string | null;
}

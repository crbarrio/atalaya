/**
 * The commands atalaya is allowed to run, and the only place they are written.
 *
 * This is the plan's "never a free shell over SSH" as code: callers name a
 * command, and no function anywhere accepts a command string. Gaining a new
 * capability means adding an entry here, which is deliberate and shows up in
 * review.
 */

/** Absolute POSIX path with no shell metacharacters. */
const SAFE_PATH = /^\/[A-Za-z0-9._\-/]*$/;

const COMMANDS = {
  /** Every instance and the last backup status, as JSON. */
  inventory: (stackPath: string) => `${stackPath} inventory`,
} as const;

export type CommandName = keyof typeof COMMANDS;

/**
 * Builds the command line for a name.
 *
 * `stackPath` is the only value interpolated, and it is checked here rather
 * than trusted: it reaches this point from the database, and a row is not a
 * safer source than a form.
 */
export function buildCommand(command: CommandName, stackPath: string): string {
  if (!SAFE_PATH.test(stackPath)) {
    throw new Error(`Refusing to build a command with stackPath '${stackPath}'`);
  }
  return COMMANDS[command](stackPath);
}

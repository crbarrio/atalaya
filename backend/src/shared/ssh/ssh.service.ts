import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { Observable } from 'rxjs';
import { Client } from 'ssh2';

import { SshTarget } from './interfaces/ssh-target.interface';
import { COMMANDS, CommandRequest, buildCommand } from './ssh-commands';

const DEFAULT_TIMEOUT_MS = 20_000;
/** Long-running commands are silent for minutes; without this the TCP connection is dropped. */
const KEEPALIVE_MS = 20_000;

/** One piece of output, as it happens. `exit` is terminal and always last. */
export type CommandEvent =
  | { type: 'output'; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'exit'; code: number };

/**
 * Runs one allowed command on one machine and returns its stdout.
 *
 * Deliberately knows nothing about inventory, servers or the database: it
 * connects, executes, and hands back text.
 */
@Injectable()
export class SshService {
  async run(
    target: SshTarget,
    request: CommandRequest,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<string> {
    const line = buildCommand(request, target.stackPath).join(' ');
    const command = request.command;
    const privateKey = this.readKey(target);

    return new Promise<string>((resolve, reject) => {
      const client = new Client();
      let stdout = '';
      let stderr = '';
      let settled = false;

      const finish = (error?: Error, value?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        client.end();
        if (error) reject(error);
        else resolve(value ?? '');
      };

      const timer = setTimeout(
        () => finish(new Error(`${target.name}: timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );

      client
        .on('ready', () => {
          client.exec(line, (err, stream) => {
            if (err) return finish(err);
            stream
              .on('close', (code: number) =>
                code === 0
                  ? finish(undefined, stdout)
                  : finish(
                      new Error(
                        `${target.name}: '${command}' exited ${code}` +
                          (stderr ? `: ${stderr.trim()}` : ''),
                      ),
                    ),
              )
              .on('data', (chunk: Buffer) => (stdout += chunk.toString()))
              .stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
          });
        })
        .on('error', (err) => finish(new Error(`${target.name}: ${err.message}`)))
        .connect({
          host: target.host,
          port: target.port,
          username: target.user,
          privateKey,
          readyTimeout: timeoutMs,
        });
    });
  }

  /**
   * The same execution, emitted as it happens instead of collected.
   *
   * Unsubscribing kills the connection, which is what makes `logs` — a
   * `docker compose logs -f` that never returns — safe to expose: the viewer
   * closing the tab tears the whole thing down rather than leaving an SSH
   * session and a follower process behind on the server.
   *
   * A non-zero exit is an `exit` event, not an error: a failed deploy has
   * output worth reading, and the caller decides what a code means.
   */
  stream(target: SshTarget, request: CommandRequest): Observable<CommandEvent> {
    const line = buildCommand(request, target.stackPath).join(' ');
    const { timeoutMs } = COMMANDS[request.command];
    const privateKey = this.readKey(target);

    return new Observable<CommandEvent>((subscriber) => {
      const client = new Client();
      let settled = false;

      const timer =
        timeoutMs === null
          ? undefined
          : setTimeout(() => {
              if (settled) return;
              settled = true;
              subscriber.error(
                new Error(`${target.name}: '${request.command}' timed out after ${timeoutMs}ms`),
              );
              client.end();
            }, timeoutMs);

      const finish = (error?: Error, code?: number) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (error) subscriber.error(error);
        else {
          subscriber.next({ type: 'exit', code: code ?? 0 });
          subscriber.complete();
        }
        client.end();
      };

      client
        .on('ready', () => {
          // A pty, unlike `run()`. `stack logs` never exits on its own, and
          // without a terminal closing the channel does not signal the remote
          // process group — every viewer who navigated away left a follower
          // running on the server. The pty makes the hangup propagate.
          //
          // The cost is that a pty has one channel, so stderr arrives merged
          // into stdout. For a console showing what a command printed, in the
          // order it printed it, that is the right trade.
          client.exec(line, { pty: true }, (err, channel) => {
            if (err) return finish(err);
            channel
              .on('close', (code: number) => finish(undefined, code ?? 0))
              .on('data', (chunk: Buffer) =>
                subscriber.next({ type: 'output', stream: 'stdout', text: chunk.toString() }),
              )
              .stderr.on('data', (chunk: Buffer) =>
                subscriber.next({ type: 'output', stream: 'stderr', text: chunk.toString() }),
              );
          });
        })
        .on('error', (err) => finish(new Error(`${target.name}: ${err.message}`)))
        .connect({
          host: target.host,
          port: target.port,
          username: target.user,
          privateKey,
          readyTimeout: DEFAULT_TIMEOUT_MS,
          keepaliveInterval: KEEPALIVE_MS,
        });

      // Teardown, on unsubscribe as well as on completion.
      return () => {
        settled = true;
        if (timer) clearTimeout(timer);
        client.end();
      };
    });
  }

  private readKey(target: SshTarget): Buffer {
    const path = target.keyPath ?? process.env.SSH_KEY_PATH;
    if (!path) {
      throw new Error('No SSH key: set SSH_KEY_PATH or the server keyPath');
    }
    try {
      return readFileSync(path);
    } catch {
      throw new Error(`Cannot read the SSH key at ${path}`);
    }
  }
}

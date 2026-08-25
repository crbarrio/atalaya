import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { Client } from 'ssh2';

import { SshTarget } from './interfaces/ssh-target.interface';
import { CommandName, buildCommand } from './ssh-commands';

const DEFAULT_TIMEOUT_MS = 20_000;

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
    command: CommandName,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<string> {
    const line = buildCommand(command, target.stackPath);
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

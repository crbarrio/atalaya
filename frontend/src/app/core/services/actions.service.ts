import { HttpClient, httpResource, HttpResourceRef } from '@angular/common/http';
import { Injectable, Signal, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE } from '../http/api.config';
import { ActionCommand, CommandEvent, StackVersions } from '../models/action.model';

export interface RunOptions {
  instance?: string;
  version?: string;
}

/** What a caller gets back from `stream`: events as they arrive, and a way to stop. */
export interface StreamHandle {
  stop(): void;
}

export interface StreamHandlers {
  onEvent(event: CommandEvent): void;
  /** Called once, on failure. A non-zero exit is not a failure — it arrives as an `exit` event. */
  onError(message: string): void;
}

/**
 * Runs `stack` commands on a server.
 *
 * Streaming uses `EventSource`, the first in this app. Identity is not a
 * problem despite `EventSource` being unable to set headers: in production
 * `tailscale serve` injects `Tailscale-User-Login` at the proxy, and nginx
 * forwards it — the browser was never the one setting it.
 */
@Injectable({ providedIn: 'root' })
export class ActionsService {
  private readonly http = inject(HttpClient);

  /**
   * Which versions exist and which one a deploy would pick. Read on entering
   * an instance page, so the version card reports what `stack` currently sees
   * rather than only what the inventory cache last recorded.
   */
  versions(server: Signal<string>, instance: Signal<string>): HttpResourceRef<StackVersions | undefined> {
    return httpResource<StackVersions>(
      () => `${API_BASE}/actions/${server()}/versions/${instance()}/list`,
    );
  }

  /** Short read-only commands, collected and returned once. */
  run(server: string, command: ActionCommand, options: RunOptions = {}): Promise<{ output: string }> {
    const query = options.instance ? `?instance=${encodeURIComponent(options.instance)}` : '';
    return firstValueFrom(
      this.http.get<{ output: string }>(`${API_BASE}/actions/${server}/${command}${query}`),
    );
  }

  stream(
    server: string,
    command: ActionCommand,
    options: RunOptions,
    handlers: StreamHandlers,
  ): StreamHandle {
    const params = new URLSearchParams();
    if (options.instance) params.set('instance', options.instance);
    if (options.version) params.set('version', options.version);

    const source = new EventSource(
      `${API_BASE}/actions/${server}/${command}/stream?${params.toString()}`,
      { withCredentials: true },
    );

    let finished = false;
    const close = () => {
      finished = true;
      source.close();
    };

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as CommandEvent;
      handlers.onEvent(event);
      // The server completes the stream after `exit`, which reaches
      // EventSource as a disconnection it would otherwise try to reconnect
      // through — closing here is what stops it re-running the command.
      if (event.type === 'exit') close();
    };

    source.onerror = () => {
      if (finished) return;
      close();
      // EventSource never says why. The backend's message went out as an HTTP
      // error the browser will not hand us, so the honest thing is to say the
      // connection dropped and point at where the reason is.
      handlers.onError('The connection to the server dropped. Check the server logs for why.');
    };

    return { stop: close };
  }
}

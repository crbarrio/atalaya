import { BadRequestException, Controller, Get, Param, Query, Req, Sse } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';

import { COMMANDS, CommandName, CommandRequest } from '../shared/ssh/ssh-commands';
import { ActionsService } from './actions.service';

/**
 * `GET` for everything, including the ones that change the server, because
 * SSE is a GET: `EventSource` cannot issue any other verb, and splitting the
 * streamed commands across two shapes would be worse than this one wart.
 * Nothing here is safe to prefetch, and nothing links to it — the browser
 * only reaches these when the operator presses a button.
 */
@ApiTags('actions')
@Controller('actions')
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Get(':server/:command')
  @ApiOperation({ summary: 'Run a short read-only stack command and return its output.' })
  async run(
    @Param('server') server: string,
    @Param('command') command: string,
    @Req() request: Request,
    @Query('instance') instance?: string,
  ) {
    const spec = this.spec(command);
    if (spec.streams) {
      throw new BadRequestException(`'${command}' streams: use /actions/${server}/${command}/stream`);
    }
    const output = await this.actions.run(
      server,
      { command: command as CommandName, argument: instance },
      actorOf(request),
    );
    return { server, command, instance: instance ?? null, output };
  }

  @Sse(':server/:command/stream')
  @ApiOperation({ summary: 'Run a stack command, streaming its output as it happens.' })
  stream(
    @Param('server') server: string,
    @Param('command') command: string,
    @Req() request: Request,
    @Query('instance') instance?: string,
    @Query('version') version?: string,
  ): Observable<{ data: string }> {
    this.spec(command);
    const commandRequest: CommandRequest = {
      command: command as CommandName,
      argument: instance,
      version,
    };

    // Serialised as JSON rather than raw text: output can contain newlines,
    // which are the SSE frame separator and would split one line into several
    // events. The client parses each frame back into one object.
    return this.actions
      .stream(server, commandRequest, actorOf(request))
      .pipe(map((event) => ({ data: JSON.stringify(event) })));
  }

  /** Rejects anything outside the catalogue before it can reach the service. */
  private spec(command: string) {
    const spec = COMMANDS[command as CommandName];
    if (!spec) throw new BadRequestException(`'${command}' is not a command atalaya can run`);
    return spec;
  }
}

function actorOf(request: Request): string {
  return request.user?.login ?? 'unknown';
}

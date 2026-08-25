import { Injectable } from '@nestjs/common';

import { SshService } from '../shared/ssh/ssh.service';
import { ReadableServer } from './interfaces/readable-server.interface';
import { StackInventory } from './interfaces/stack-inventory.interface';
import { parseStackInventory } from './parsers/stack-inventory.parser';

/** Turns a server into a parsed inventory. Reads; stores nothing. */
@Injectable()
export class InventoryReader {
  constructor(private readonly ssh: SshService) {}

  async read(server: ReadableServer): Promise<StackInventory> {
    const raw = await this.ssh.run(
      {
        name: server.name,
        host: server.host,
        port: server.sshPort,
        user: server.sshUser,
        keyPath: server.sshKeyPath,
        stackPath: server.stackPath,
      },
      'inventory',
    );
    return parseStackInventory(raw);
  }
}

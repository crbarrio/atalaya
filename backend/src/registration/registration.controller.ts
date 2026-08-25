import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ProvisionCheckService } from './provision-check.service';
import { RegistrationService } from './registration.service';
import type { RegisterServerRequest } from './interfaces/register-server.interface';
import { SetupScriptService } from './setup-script.service';

@ApiTags('registration')
@Controller('servers')
export class RegistrationController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly setupScript: SetupScriptService,
    private readonly provisionCheck: ProvisionCheckService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Register a server. Touches nothing remote — the artifact does that.' })
  register(@Body() body: RegisterServerRequest) {
    return this.registration.register(body);
  }

  @Get(':name/setup-script')
  @Header('Content-Type', 'text/x-shellscript')
  @ApiOperation({ summary: 'setup-server.sh personalised for this server — download and run it.' })
  async setupScriptFor(@Param('name') name: string, @Res() res: Response) {
    const script = await this.setupScript.generate(name);
    res.setHeader('Content-Disposition', `attachment; filename="setup-${name}.sh"`);
    res.send(script);
  }

  @Post(':name/verify')
  @ApiOperation({ summary: 'Traffic-light check: node_exporter, cAdvisor, and Prometheus scraping both.' })
  verify(@Param('name') name: string) {
    return this.provisionCheck.verify(name);
  }

  @Delete(':name')
  @HttpCode(204)
  @ApiOperation({ summary: 'Deregister a server. Drops it from the registry only — the machine itself is untouched.' })
  deregister(@Param('name') name: string) {
    return this.registration.deregister(name);
  }
}

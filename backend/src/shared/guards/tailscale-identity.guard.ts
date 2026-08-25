import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { isLoopback } from '../../main';

export interface AtalayaUser {
  login: string;
  source: 'tailscale' | 'development';
}

declare module 'express' {
  interface Request {
    user?: AtalayaUser;
  }
}

/**
 * Identity from `tailscale serve`, which injects Tailscale-User-Login for the
 * authenticated tailnet user.
 *
 * The header is only believed when the process listens on a loopback address.
 * Otherwise anyone able to reach the port could set the header themselves and
 * become whoever they liked, so the guard fails closed instead — a misconfigured
 * deployment loses access rather than silently losing authentication.
 */
@Injectable()
export class TailscaleIdentityGuard implements CanActivate {
  private readonly logger = new Logger(TailscaleIdentityGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = this.resolveUser(request);

    if (!user) throw new UnauthorizedException('No identity');

    request.user = user;
    return true;
  }

  private resolveUser(request: Request): AtalayaUser | null {
    const trustHeader = process.env.TRUST_TAILSCALE_HEADER === 'true';
    const host = process.env.HOST ?? '127.0.0.1';

    if (trustHeader) {
      if (!isLoopback(host)) {
        // Configured to trust the header while reachable from the network.
        // Refusing is the only safe reading of that combination.
        this.logger.error(
          'TRUST_TAILSCALE_HEADER is on but HOST is not loopback. Refusing to trust the header.',
        );
        return null;
      }

      const login = request.header('Tailscale-User-Login');
      if (login) return { login, source: 'tailscale' };
      return null;
    }

    // Development stand-in, so the app is usable without a tailnet in front.
    if (process.env.NODE_ENV !== 'production' && process.env.DEV_USER_EMAIL) {
      return { login: process.env.DEV_USER_EMAIL, source: 'development' };
    }

    return null;
  }
}

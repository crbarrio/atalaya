import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opts a route out of the identity guard. Health checks and the Alertmanager webhook. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

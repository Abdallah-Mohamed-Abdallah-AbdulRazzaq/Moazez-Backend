import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  buildPrismaPostgresqlDatasourceUrl,
  type DatabaseRuntimeRole,
} from './database-runtime.policy';

export const PRISMA_CLIENT_OPTIONS = Symbol('PRISMA_CLIENT_OPTIONS');

export type PrismaClientRuntimeOptions = Pick<
  Prisma.PrismaClientOptions,
  'datasourceUrl'
>;

export function createPrismaClientOptions(
  configService: ConfigService,
): PrismaClientRuntimeOptions {
  const options = {
    datasourceUrl: buildPrismaPostgresqlDatasourceUrl({
      databaseUrl: configService.getOrThrow<string>('DATABASE_URL'),
      role: configService.getOrThrow<DatabaseRuntimeRole>(
        'DATABASE_RUNTIME_ROLE',
      ),
      connectionLimit: configService.getOrThrow<number>(
        'DATABASE_CONNECTION_LIMIT',
      ),
      poolTimeoutSeconds: configService.getOrThrow<number>(
        'DATABASE_POOL_TIMEOUT_SECONDS',
      ),
      connectTimeoutSeconds: configService.getOrThrow<number>(
        'DATABASE_CONNECT_TIMEOUT_SECONDS',
      ),
    }),
  };

  return Object.freeze(options);
}

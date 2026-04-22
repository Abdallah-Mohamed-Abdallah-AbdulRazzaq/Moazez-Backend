import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export type CheckStatus = 'ok' | 'error' | 'skipped';

export interface DependencyCheck {
  status: CheckStatus;
  durationMs: number;
  message?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
  checks: {
    db: DependencyCheck;
    redis: DependencyCheck;
    storage: DependencyCheck;
  };
}

const VERSION = '0.1.0';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthReport> {
    const db = await this.timed(async () => {
      await this.prisma.$queryRaw`SELECT 1`;
    });

    const redis: DependencyCheck = { status: 'skipped', durationMs: 0 };
    const storage: DependencyCheck = { status: 'skipped', durationMs: 0 };

    const overall: 'ok' | 'degraded' = db.status === 'ok' ? 'ok' : 'degraded';

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      version: VERSION,
      checks: { db, redis, storage },
    };
  }

  private async timed(fn: () => Promise<void>): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      await fn();
      return { status: 'ok', durationMs: Date.now() - start };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Health check failed: ${message}`);
      return {
        status: 'error',
        durationMs: Date.now() - start,
        message,
      };
    }
  }
}

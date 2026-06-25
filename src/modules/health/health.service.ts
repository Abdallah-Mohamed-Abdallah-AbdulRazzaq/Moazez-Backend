import { Injectable, Logger } from '@nestjs/common';
import {
  SchoolEmailConnectionStatus,
  SchoolEmailProviderType,
} from '@prisma/client';
import { FirebaseAdminService } from '../../infrastructure/push/firebase/firebase-admin.service';
import { BullmqService } from '../../infrastructure/queue/bullmq.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
} from '../communication/domain/communication-notification-generation-domain';
import { EmailSecretCrypto } from '../settings/email/domain/email-secret-crypto';
import { SCHOOL_EMAIL_DELIVERY_QUEUE_NAME } from '../settings/email/delivery/domain/email-delivery.constants';

export type CheckStatus = 'ok' | 'degraded' | 'error' | 'skipped';

export interface DependencyCheck {
  status: CheckStatus;
  durationMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
  checks: {
    db: DependencyCheck;
    redis: DependencyCheck;
    storage: DependencyCheck;
    queues: DependencyCheck;
    email: DependencyCheck;
    push: DependencyCheck;
  };
}

const VERSION = '0.1.0';
const HEALTH_CHECK_TIMEOUT_MS = 1_000;
const QUEUE_NAMES = [
  SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
];

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bullmqService: BullmqService,
    private readonly storageService: StorageService,
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly emailSecretCrypto: EmailSecretCrypto,
  ) {}

  async check(): Promise<HealthReport> {
    const [db, redis, storage, queues, email, push] = await Promise.all([
      this.timed('db', async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      this.timed('redis', () => this.bullmqService.ping()),
      this.timed('storage', () => this.storageService.checkReadiness()),
      this.timed('queues', () => this.checkQueues()),
      this.timed('email', () => this.checkEmailReadiness()),
      this.timed('push', () => this.checkPushReadiness()),
    ]);

    const required = [db, redis, storage, queues];
    const optional = [email, push];
    const overall: 'ok' | 'degraded' =
      [...required, ...optional].some(
        (check) => check.status === 'error' || check.status === 'degraded',
      )
        ? 'degraded'
        : 'ok';

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      version: VERSION,
      checks: { db, redis, storage, queues, email, push },
    };
  }

  private async checkQueues(): Promise<DependencyCheckResult> {
    const queues = await Promise.all(
      QUEUE_NAMES.map((name) => this.bullmqService.getQueueReadiness(name)),
    );

    return {
      status: queues.some((queue) => queue.counts.failed > 0)
        ? 'degraded'
        : 'ok',
      details: {
        queues,
      },
    };
  }

  private async checkEmailReadiness(): Promise<DependencyCheckResult> {
    const activeConnections = await this.prisma.schoolEmailConnection.findMany({
      where: { status: SchoolEmailConnectionStatus.ACTIVE },
      select: {
        providerType: true,
        host: true,
        port: true,
        username: true,
        encryptedPassword: true,
      },
    });

    if (activeConnections.length === 0) {
      return {
        status: 'skipped',
        message: 'no_active_email_connections',
        details: { activeConnections: 0 },
      };
    }

    let readyConnections = 0;
    let invalidConnections = 0;

    for (const connection of activeConnections) {
      const smtpReady =
        connection.providerType === SchoolEmailProviderType.SMTP &&
        Boolean(connection.host) &&
        Boolean(connection.port) &&
        Boolean(connection.username) &&
        Boolean(connection.encryptedPassword);

      if (!smtpReady) {
        invalidConnections += 1;
        continue;
      }

      try {
        this.emailSecretCrypto.decrypt(connection.encryptedPassword ?? '');
        readyConnections += 1;
      } catch {
        invalidConnections += 1;
      }
    }

    return {
      status: invalidConnections > 0 ? 'degraded' : 'ok',
      message:
        invalidConnections > 0 ? 'email_connection_not_ready' : undefined,
      details: {
        activeConnections: activeConnections.length,
        readyConnections,
        invalidConnections,
      },
    };
  }

  private checkPushReadiness(): DependencyCheckResult {
    const readiness = this.firebaseAdminService.checkReadiness();

    if (readiness.mode === 'disabled') {
      return {
        status: 'skipped',
        message: 'push_disabled',
        details: { mode: readiness.mode },
      };
    }

    return {
      status: 'ok',
      details: { mode: readiness.mode },
    };
  }

  private async timed(
    name: string,
    fn: () => Promise<void | DependencyCheckResult> | void | DependencyCheckResult,
  ): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      const result = await withTimeout(
        Promise.resolve(fn()),
        HEALTH_CHECK_TIMEOUT_MS,
      );
      const durationMs = Date.now() - start;
      if (result && typeof result === 'object') {
        return {
          status: result.status ?? 'ok',
          durationMs,
          message: result.message,
          details: result.details,
        };
      }

      return { status: 'ok', durationMs };
    } catch (error) {
      const message = sanitizeDependencyFailure(error);
      this.logger.warn(`Health check ${name} failed: ${message}`);
      return {
        status: 'error',
        durationMs: Date.now() - start,
        message,
      };
    }
  }
}

interface DependencyCheckResult {
  status?: CheckStatus;
  message?: string;
  details?: Record<string, unknown>;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error('dependency_check_timeout')),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() =>
    timeout ? clearTimeout(timeout) : undefined,
  );
}

function sanitizeDependencyFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const trimmed = raw.trim();

  if (/^[a-z0-9_.-]+$/i.test(trimmed) && trimmed.length <= 80) {
    return trimmed;
  }

  return 'dependency_check_failed';
}

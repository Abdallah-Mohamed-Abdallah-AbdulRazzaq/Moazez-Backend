import {
  SchoolEmailConnectionStatus,
  SchoolEmailProviderType,
} from '@prisma/client';
import { FirebaseAdminService } from '../../infrastructure/push/firebase/firebase-admin.service';
import { BullmqService } from '../../infrastructure/queue/bullmq.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EmailSecretCrypto } from '../settings/email/domain/email-secret-crypto';
import { HealthService } from './health.service';

describe('HealthService', () => {
  function buildService(overrides?: {
    prisma?: Partial<PrismaService>;
    bullmq?: Partial<BullmqService>;
    storage?: Partial<StorageService>;
    firebase?: Partial<FirebaseAdminService>;
    emailCrypto?: Partial<EmailSecretCrypto>;
  }) {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      schoolEmailConnection: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      ...(overrides?.prisma ?? {}),
    } as unknown as PrismaService & {
      schoolEmailConnection: { findMany: jest.Mock };
    };
    const bullmq = {
      ping: jest.fn().mockResolvedValue(undefined),
      getQueueReadiness: jest.fn((name: string) =>
        Promise.resolve({
          name,
          status: 'ok',
          counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
        }),
      ),
      ...(overrides?.bullmq ?? {}),
    } as unknown as BullmqService;
    const storage = {
      checkReadiness: jest.fn().mockResolvedValue(undefined),
      ...(overrides?.storage ?? {}),
    } as unknown as StorageService;
    const firebase = {
      checkReadiness: jest.fn().mockReturnValue({ mode: 'disabled' }),
      ...(overrides?.firebase ?? {}),
    } as unknown as FirebaseAdminService;
    const emailCrypto = {
      decrypt: jest.fn((value: string) => value.replace(/^encrypted:/, '')),
      ...(overrides?.emailCrypto ?? {}),
    } as unknown as EmailSecretCrypto;

    return new HealthService(
      prisma,
      bullmq,
      storage,
      firebase,
      emailCrypto,
    );
  }

  it('reports ok for required dependencies and skips disabled optional providers', async () => {
    const service = buildService();

    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.checks.db.status).toBe('ok');
    expect(report.checks.redis.status).toBe('ok');
    expect(report.checks.storage.status).toBe('ok');
    expect(report.checks.queues.status).toBe('ok');
    expect(report.checks.email.status).toBe('skipped');
    expect(report.checks.email.message).toBe('no_active_email_connections');
    expect(report.checks.push.status).toBe('skipped');
    expect(report.checks.push.message).toBe('push_disabled');
  });

  it('degrades when queue readiness reports failed jobs', async () => {
    const service = buildService({
      bullmq: {
        getQueueReadiness: jest.fn((name: string) =>
          Promise.resolve({
            name,
            status: 'ok',
            counts: {
              waiting: 0,
              active: 0,
              delayed: 0,
              failed: name === 'school-email-delivery' ? 2 : 0,
            },
          }),
        ) as unknown as BullmqService['getQueueReadiness'],
      },
    });

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.checks.queues.status).toBe('degraded');
    expect(JSON.stringify(report.checks.queues.details)).toContain(
      'school-email-delivery',
    );
  });

  it('sanitizes dependency failure messages on the public report', async () => {
    const service = buildService({
      storage: {
        checkReadiness: jest
          .fn()
          .mockRejectedValue(
            new Error(
              'connect failed at https://minio.local?secret=storage-secret',
            ),
          ),
      },
    });

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.checks.storage.status).toBe('error');
    expect(report.checks.storage.message).toBe('dependency_check_failed');
    expect(JSON.stringify(report)).not.toContain('storage-secret');
    expect(JSON.stringify(report)).not.toContain('https://minio.local');
  });

  it('degrades email readiness without exposing encrypted secret material', async () => {
    const service = buildService({
      prisma: {
        schoolEmailConnection: {
          findMany: jest.fn().mockResolvedValue([
            {
              providerType: SchoolEmailProviderType.SMTP,
              host: 'smtp.example.test',
              port: 587,
              username: 'smtp-user',
              encryptedPassword: 'encrypted-secret-value',
              status: SchoolEmailConnectionStatus.ACTIVE,
            },
          ]),
        },
      } as unknown as Partial<PrismaService>,
      emailCrypto: {
        decrypt: jest.fn(() => {
          throw new Error('bad key encrypted-secret-value');
        }),
      },
    });

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.checks.email.status).toBe('degraded');
    expect(report.checks.email.message).toBe('email_connection_not_ready');
    expect(report.checks.email.details).toEqual({
      activeConnections: 1,
      readyConnections: 0,
      invalidConnections: 1,
    });
    expect(JSON.stringify(report)).not.toContain('encrypted-secret-value');
  });
});

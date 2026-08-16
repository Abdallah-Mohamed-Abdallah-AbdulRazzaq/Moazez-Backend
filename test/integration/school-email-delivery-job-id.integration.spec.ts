import type { ConfigService } from '@nestjs/config';
import { UserType } from '@prisma/client';
import type { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { SchoolEmailDeliveryQueueService } from '../../src/modules/settings/email/delivery/application/school-email-delivery-queue.service';
import {
  buildSchoolEmailDeliveryRecipientJobId,
  SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
  SCHOOL_EMAIL_DELIVERY_SEND_RECIPIENT_JOB_NAME,
  type SchoolEmailDeliveryRecipientJobData,
} from '../../src/modules/settings/email/delivery/domain/email-delivery.constants';

jest.setTimeout(30_000);

const integrationEnabled = process.env.RUN_PRD1_G05_REDIS_INTEGRATION === '1';
const describeRedisIntegration = integrationEnabled ? describe : describe.skip;
const dedicatedRedisUrl = integrationEnabled
  ? requireDedicatedRedisUrl()
  : undefined;

describeRedisIntegration('School email delivery custom BullMQ job ID', () => {
  let bullmqService: BullmqService;
  let deliveryQueueService: SchoolEmailDeliveryQueueService;
  let queue: Queue<SchoolEmailDeliveryRecipientJobData>;
  let cleanupRedis: IORedis;
  let moduleDestroyCalls = 0;

  beforeAll(async () => {
    if (!dedicatedRedisUrl) {
      throw new Error('Dedicated PRD1-G05 Redis URL was not resolved');
    }

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'QUEUE_REDIS_URL') return dedicatedRedisUrl;
        if (key === 'QUEUE_REDIS_TLS_CA_PEM') return undefined;
        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    } as unknown as ConfigService;

    bullmqService = new BullmqService(configService);
    deliveryQueueService = new SchoolEmailDeliveryQueueService(bullmqService);
    await bullmqService.getQueueReadiness(SCHOOL_EMAIL_DELIVERY_QUEUE_NAME);
    queue = bullmqService.getQueue(
      SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
    ) as Queue<SchoolEmailDeliveryRecipientJobData>;
    cleanupRedis = new IORedis(dedicatedRedisUrl, {
      maxRetriesPerRequest: null,
    });
  });

  beforeEach(async () => {
    await removeTestQueueData(queue);
    await expect(findTestQueueKeys(cleanupRedis)).resolves.toEqual([]);
  });

  afterEach(async () => {
    await removeTestQueueData(queue);
    const residualKeys = await findTestQueueKeys(cleanupRedis);
    if (residualKeys.length > 0) {
      await cleanupRedis.unlink(...residualKeys);
    }
    expect(residualKeys).toEqual([]);
  });

  afterAll(async () => {
    let destroyError: unknown;
    try {
      moduleDestroyCalls += 1;
      await bullmqService.onModuleDestroy();
    } catch (error) {
      destroyError = error;
    }

    let residualKeys: string[] = [];
    try {
      residualKeys = await findTestQueueKeys(cleanupRedis);
      if (residualKeys.length > 0) {
        await cleanupRedis.unlink(...residualKeys);
      }
    } finally {
      await cleanupRedis.quit();
    }

    expect(moduleDestroyCalls).toBe(1);
    expect(residualKeys).toEqual([]);
    if (destroyError instanceof Error) {
      throw destroyError;
    }
    if (destroyError !== undefined) {
      throw new Error('BullMQ module destroy failed', {
        cause: destroyError,
      });
    }
  });

  it('stores the production ID exactly and suppresses a duplicate enqueue', async () => {
    const firstEnqueue = {
      schoolId: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
      batchId: '33333333-3333-4333-8333-333333333333',
      recipientId: '44444444-4444-4444-8444-444444444444',
      actorUserId: '55555555-5555-4555-8555-555555555555',
      actorUserType: UserType.SCHOOL_USER,
    };
    const secondEnqueue = {
      ...firstEnqueue,
      actorUserId: '66666666-6666-4666-8666-666666666666',
    };
    const expectedJobId = buildSchoolEmailDeliveryRecipientJobId({
      batchId: firstEnqueue.batchId,
      recipientId: firstEnqueue.recipientId,
    });
    const expectedFirstPayload: SchoolEmailDeliveryRecipientJobData = {
      ...firstEnqueue,
    };

    expect(expectedJobId).toBe(
      `school-email-delivery:${firstEnqueue.batchId}:${firstEnqueue.recipientId}`,
    );
    expect(queue.name).toBe(SCHOOL_EMAIL_DELIVERY_QUEUE_NAME);

    const firstJob =
      await deliveryQueueService.enqueueRecipientDelivery(firstEnqueue);
    expect(firstJob.id).toBe(expectedJobId);

    const storedFirstJob = await queue.getJob(expectedJobId);
    expect(storedFirstJob).toBeDefined();
    expect(storedFirstJob?.id).toBe(expectedJobId);
    expect(storedFirstJob?.name).toBe(
      SCHOOL_EMAIL_DELIVERY_SEND_RECIPIENT_JOB_NAME,
    );
    expect(storedFirstJob?.data).toEqual(expectedFirstPayload);
    expect(storedFirstJob?.opts.attempts).toBe(3);
    expect(storedFirstJob?.opts.backoff).toEqual({
      type: 'exponential',
      delay: 1000,
    });

    const duplicateJob =
      await deliveryQueueService.enqueueRecipientDelivery(secondEnqueue);
    expect(duplicateJob.id).toBe(expectedJobId);

    const storedAfterDuplicate = await queue.getJob(expectedJobId);
    expect(storedAfterDuplicate).toBeDefined();
    expect(storedAfterDuplicate?.id).toBe(expectedJobId);
    expect(storedAfterDuplicate?.data).toEqual(expectedFirstPayload);
    expect(storedAfterDuplicate?.data).not.toEqual(secondEnqueue);

    const allStoredJobs = await queue.getJobs(
      [
        'wait',
        'paused',
        'delayed',
        'active',
        'completed',
        'failed',
        'prioritized',
        'waiting-children',
      ],
      0,
      -1,
      true,
    );
    const matchingJobs = allStoredJobs.filter(
      (job) => job.id === expectedJobId,
    );
    const counts = await queue.getJobCounts(
      'waiting',
      'delayed',
      'active',
      'completed',
      'failed',
    );

    expect(matchingJobs).toHaveLength(1);
    expect(allStoredJobs).toHaveLength(1);
    expect({
      waiting: counts.waiting ?? 0,
      delayed: counts.delayed ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
    }).toEqual({
      waiting: 1,
      delayed: 0,
      active: 0,
      completed: 0,
      failed: 0,
    });

    console.log(
      JSON.stringify({
        event: 'prd1-g05.school-email-delivery-job-id.proven',
        queueName: queue.name,
        jobName: storedAfterDuplicate?.name,
        storedJobId: storedAfterDuplicate?.id,
        storedJobCount: matchingJobs.length,
        duplicateReturnedSameId: duplicateJob.id === expectedJobId,
        firstPayloadRetained:
          storedAfterDuplicate?.data.actorUserId === firstEnqueue.actorUserId,
        attempts: storedAfterDuplicate?.opts.attempts,
        backoff: storedAfterDuplicate?.opts.backoff,
        counts: {
          waiting: counts.waiting ?? 0,
          delayed: counts.delayed ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
        },
      }),
    );
  });
});

function requireDedicatedRedisUrl(): string {
  const value = process.env.PRD1_G05_REDIS_URL;
  if (!value) {
    throw new Error(
      'PRD1_G05_REDIS_URL is required when RUN_PRD1_G05_REDIS_INTEGRATION=1',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('PRD1_G05_REDIS_URL must be a valid Redis URL');
  }

  if (
    (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') ||
    !parsed.hostname ||
    (parsed.port && !isValidPort(parsed.port))
  ) {
    throw new Error('PRD1_G05_REDIS_URL must be a valid Redis URL');
  }

  return value;
}

function isValidPort(value: string): boolean {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

async function removeTestQueueData(
  queue: Queue<SchoolEmailDeliveryRecipientJobData>,
): Promise<void> {
  await queue.obliterate({ force: true });
}

async function findTestQueueKeys(redis: IORedis): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, page] = await redis.scan(
      cursor,
      'MATCH',
      `bull:${SCHOOL_EMAIL_DELIVERY_QUEUE_NAME}:*`,
      'COUNT',
      100,
    );
    cursor = nextCursor;
    keys.push(...page);
  } while (cursor !== '0');

  return [...new Set(keys)].sort();
}

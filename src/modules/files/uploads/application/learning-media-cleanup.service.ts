import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Job, Queue } from 'bullmq';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import {
  LEARNING_MEDIA_STALE_CLAIM_MS,
} from '../domain/learning-media.constants';
import {
  LEARNING_MEDIA_CLEANUP_QUEUE,
  LEARNING_MEDIA_DISCOVERY_JOB_NAME,
} from '../domain/learning-media-cleanup.constants';
import { LearningMediaRepository } from '../infrastructure/learning-media.repository';
import type { LearningMediaCleanupTarget } from '../infrastructure/learning-media.repository';

const FINISHED_JOB_REPLACEMENT_LOCK_MS = 30_000;
const FINISHED_JOB_STATES = new Set(['completed', 'failed']);
const RELEASE_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;

type CleanupJobData = {
  uploadId: string;
  target: LearningMediaCleanupTarget;
};

@Injectable()
export class LearningMediaCleanupService implements OnModuleInit {
  constructor(
    private readonly queue: BullmqService,
    private readonly repository: LearningMediaRepository,
    private readonly storage: StorageService,
  ) {}

  onModuleInit(): void {
    this.queue.createWorker<Record<string, unknown>>(
      LEARNING_MEDIA_CLEANUP_QUEUE,
      async (job) => {
        if (job.name === LEARNING_MEDIA_DISCOVERY_JOB_NAME) {
          return this.discoverAndEnqueue();
        }
        if (job.name === 'cleanup') {
          const data = job.data as CleanupJobData;
          return this.cleanUpload(data.uploadId, data.target);
        }
        throw new Error('learning_media_cleanup_job_unknown');
      },
    );
  }

  async discoverAndEnqueue(now = new Date()): Promise<number> {
    await this.repository.expireAbandonedSessions(now);
    const staleBefore = new Date(now.getTime() - LEARNING_MEDIA_STALE_CLAIM_MS);
    const candidates = await this.repository.discoverCleanupCandidates(
      now,
      staleBefore,
    );
    const queue = this.queue.getQueue(LEARNING_MEDIA_CLEANUP_QUEUE);
    let enqueued = 0;
    for (const candidate of candidates) {
      const jobId = learningMediaCleanupJobId(
        candidate.uploadId,
        candidate.target,
      );
      const data = {
        uploadId: candidate.uploadId,
        target: candidate.target,
      };
      if (await this.enqueueCleanupCandidate(queue, jobId, data)) {
        enqueued += 1;
      }
    }
    return enqueued;
  }

  private async enqueueCleanupCandidate(
    queue: Queue,
    jobId: string,
    data: CleanupJobData,
  ): Promise<boolean> {
    const existing = await queue.getJob(jobId);
    if (!existing) {
      await this.addCleanupJob(jobId, data);
      return true;
    }

    const state = await existing.getState();
    if (!FINISHED_JOB_STATES.has(state)) return false;

    const client = await queue.client;
    const lockKey = queue.toKey(`finished-replacement:${jobId}`);
    const lockToken = randomUUID();
    const acquired = await client.set(
      lockKey,
      lockToken,
      'PX',
      FINISHED_JOB_REPLACEMENT_LOCK_MS,
      'NX',
    );
    if (acquired !== 'OK') return false;

    try {
      const current = await queue.getJob(jobId);
      if (current) {
        const currentState = await current.getState();
        if (!FINISHED_JOB_STATES.has(currentState)) return false;
        await queue.remove(jobId);
      }

      const replacement = await queue.getJob(jobId);
      if (replacement) return false;
      await this.addCleanupJob(jobId, data);
      return true;
    } finally {
      await client.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockToken);
    }
  }

  private async addCleanupJob(
    jobId: string,
    data: CleanupJobData,
  ): Promise<void> {
    await this.queue.addJob(LEARNING_MEDIA_CLEANUP_QUEUE, 'cleanup', data, {
      jobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1_000 },
    });
  }

  async cleanUpload(
    uploadId: string,
    target: LearningMediaCleanupTarget,
    now = new Date(),
  ): Promise<boolean> {
    const claim = await this.repository.claimCleanup(
      uploadId,
      target,
      now,
      new Date(now.getTime() - LEARNING_MEDIA_STALE_CLAIM_MS),
      true,
    );
    if (!claim) return false;
    if (
      claim.cleanStaging &&
      claim.session.stagingBucket &&
      claim.session.stagingObjectKey
    ) {
      await this.storage.deleteObjectAndConfirmAbsent({
        bucket: claim.session.stagingBucket,
        objectKey: claim.session.stagingObjectKey,
      });
    }
    if (claim.cleanFinal) {
      await this.storage.deleteObjectAndConfirmAbsent({
        bucket: claim.session.finalBucket,
        objectKey: claim.session.finalObjectKey,
      });
    }
    await this.repository.finishCleanup({
      uploadId,
      target,
      now,
      stagingDeleted: claim.cleanStaging,
      finalDeleted: claim.cleanFinal,
    });
    return true;
  }
}

export function learningMediaCleanupJobId(
  uploadId: string,
  target: LearningMediaCleanupTarget,
): string {
  return `learning-media-cleanup-${uploadId}-${target}`;
}

export type LearningMediaCleanupJob = Job<CleanupJobData>;

export {
  LEARNING_MEDIA_CLEANUP_QUEUE,
  LEARNING_MEDIA_DISCOVERY_JOB_ID,
  LEARNING_MEDIA_DISCOVERY_JOB_NAME,
} from '../domain/learning-media-cleanup.constants';

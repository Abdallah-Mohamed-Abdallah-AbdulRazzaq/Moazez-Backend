import { Injectable, Logger } from '@nestjs/common';
import { AcademicContentPublicationStatus as Status } from '@prisma/client';
import {
  BullmqService,
  PersistedTruthJobEnsureResult,
} from '../../../../infrastructure/queue/bullmq.service';
import {
  ACADEMIC_CONTENT_PUBLICATION_QUEUE,
  AcademicContentPublicationJobData,
  academicContentPublicationJobId,
} from '../domain/academic-content-publication-runtime.constants';
import { AcademicContentPublicationRuntimeRepository } from '../infrastructure/academic-content-publication-runtime.repository';

@Injectable()
export class AcademicContentPublicationQueueService {
  private readonly logger = new Logger(
    AcademicContentPublicationQueueService.name,
  );
  constructor(
    private readonly queue: BullmqService,
    private readonly publications: AcademicContentPublicationRuntimeRepository,
  ) {}

  async ensure(
    job: 'publish' | 'expire',
    identity: AcademicContentPublicationJobData,
    now = new Date(),
  ): Promise<PersistedTruthJobEnsureResult> {
    // Re-read after lifecycle commit; a concurrent withdrawal can already be terminal.
    const row = await this.publications.find(identity);
    if (
      !row ||
      (job === 'publish'
        ? row.status !== Status.SCHEDULED
        : row.status !== Status.PUBLISHED || row.visibleUntil === null)
    )
      return 'not_required';
    const at = job === 'publish' ? row.publishAt : row.visibleUntil!;
    const outcome = await this.queue.ensureJobFromPersistedTruth(
      ACADEMIC_CONTENT_PUBLICATION_QUEUE,
      job,
      identity,
      {
        jobId: academicContentPublicationJobId(job, identity),
        delay: Math.max(0, at.getTime() - now.getTime()),
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
    if (outcome === 'created' || outcome === 'replaced')
      this.logger.log({
        event: 'academic_content.publication.job_recovered',
        job,
        outcome,
        ...identity,
      });
    return outcome;
  }

  async ensureAfterCommit(
    job: 'publish' | 'expire',
    identity: AcademicContentPublicationJobData,
    now = new Date(),
  ) {
    try {
      return await this.ensure(job, identity, now);
    } catch {
      this.logger.warn({
        event: 'academic_content.publication.queue_recovery_pending',
        job,
        ...identity,
      });
      return undefined;
    }
  }
}

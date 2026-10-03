import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { AcademicContentPublicationReconciliationService } from '../application/academic-content-publication-reconciliation.service';
import { AcademicContentPublicationQueueService } from '../application/academic-content-publication-queue.service';
import {
  ACADEMIC_CONTENT_PUBLICATION_QUEUE,
  ACADEMIC_CONTENT_PUBLICATION_PUBLISH_JOB,
  ACADEMIC_CONTENT_PUBLICATION_EXPIRE_JOB,
  ACADEMIC_CONTENT_PUBLICATION_RECONCILE_JOB,
  isAcademicContentPublicationJobData,
} from '../domain/academic-content-publication-runtime.constants';
import { AcademicContentPublicationSnapshotRepository } from './academic-content-publication-snapshot.repository';
import { AcademicContentPublicationLifecycleRepository } from './academic-content-publication-lifecycle.repository';

@Injectable()
export class AcademicContentPublicationWorker implements OnModuleInit {
  private readonly logger = new Logger(AcademicContentPublicationWorker.name);
  constructor(
    private readonly bullmq: BullmqService,
    private readonly snapshots: AcademicContentPublicationSnapshotRepository,
    private readonly lifecycle: AcademicContentPublicationLifecycleRepository,
    private readonly queue: AcademicContentPublicationQueueService,
    private readonly reconciliation: AcademicContentPublicationReconciliationService,
  ) {}

  onModuleInit(): void {
    this.bullmq.createWorker<object, void>(
      ACADEMIC_CONTENT_PUBLICATION_QUEUE,
      async (job) => {
        await this.process(job.name, job.data);
      },
    );
  }

  async process(name: string, data: unknown, now = new Date()): Promise<void> {
    try {
      if (name === ACADEMIC_CONTENT_PUBLICATION_RECONCILE_JOB) {
        if (
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data) ||
          Object.keys(data).length !== 0
        )
          throw new Error('academic_content_publication_job_invalid');
        await this.reconciliation.reconcile(now);
        return;
      }
      if (
        name !== ACADEMIC_CONTENT_PUBLICATION_PUBLISH_JOB &&
        name !== ACADEMIC_CONTENT_PUBLICATION_EXPIRE_JOB
      )
        throw new Error('academic_content_publication_job_unknown');
      if (!isAcademicContentPublicationJobData(data))
        throw new Error('academic_content_publication_job_invalid');
      if (name === ACADEMIC_CONTENT_PUBLICATION_PUBLISH_JOB) {
        const result = await this.snapshots.publishScheduledPublication({
          ...data,
          now,
        });
        if (
          result.outcome === 'PUBLISHED' ||
          result.outcome === 'ALREADY_PUBLISHED'
        ) {
          await this.queue.ensureAfterCommit('expire', data, now);
          this.logger.log({
            event: 'academic_content.publication.completed',
            ...data,
            outcome: result.outcome,
          });
          return;
        }
        if (result.outcome !== 'MISSED_VISIBILITY_WINDOW') return;
        this.logger.log({
          event: 'academic_content.publication.missed_visibility_window',
          ...data,
        });
      }
      const result = await this.lifecycle.expire({ ...data, now });
      if (result.outcome === 'EXPIRED')
        this.logger.log({
          event: 'academic_content.publication.expired',
          ...data,
        });
    } catch (error) {
      this.logger.warn({
        event: 'academic_content.publication.worker_failed',
        job: ['publish', 'expire', 'reconcile'].includes(name)
          ? name
          : 'unknown',
      });
      throw error;
    }
  }
}

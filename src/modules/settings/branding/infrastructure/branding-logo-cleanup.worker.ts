import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { BrandingLogoCleanupQueueService } from '../application/branding-logo-cleanup-queue.service';
import { ProcessBrandingLogoCleanupUseCase } from '../application/process-branding-logo-cleanup.use-case';
import {
  BRANDING_LOGO_CLEANUP_JOB,
  BRANDING_LOGO_CLEANUP_QUEUE,
  BRANDING_LOGO_RECONCILE_JOB,
} from '../domain/branding-logo.constants';
import {
  BrandingLogoCleanupJobData,
  BrandingLogoReconcileJobData,
} from '../domain/branding-logo.types';

type BrandingLogoJobData =
  | BrandingLogoCleanupJobData
  | BrandingLogoReconcileJobData;

@Injectable()
export class BrandingLogoCleanupWorker implements OnModuleInit {
  private readonly logger = new Logger(BrandingLogoCleanupWorker.name);

  constructor(
    private readonly bullmqService: BullmqService,
    private readonly processCleanup: ProcessBrandingLogoCleanupUseCase,
    private readonly cleanupQueue: BrandingLogoCleanupQueueService,
  ) {}

  onModuleInit(): void {
    const worker = this.bullmqService.createWorker<BrandingLogoJobData>(
      BRANDING_LOGO_CLEANUP_QUEUE,
      (job) => this.process(job),
    );
    worker.on('failed', (job) => {
      const attempts = job?.opts.attempts ?? 1;
      this.logger.error({
        event:
          job && job.attemptsMade >= attempts
            ? 'branding.logo.cleanup.failed'
            : 'branding.logo.cleanup.attempt_failed',
      });
    });
    void this.cleanupQueue
      .getReadiness()
      .then((readiness) => {
        this.logger.log({
          event: 'branding.logo.cleanup.queue_ready',
          counts: readiness.counts,
        });
      })
      .catch(() => {
        this.logger.error({ event: 'branding.logo.cleanup.readiness_failed' });
      });
  }

  private async process(job: Job<BrandingLogoJobData>): Promise<void> {
    if (job.name === BRANDING_LOGO_CLEANUP_JOB && 'fileId' in job.data) {
      await this.processCleanup.cleanup(job.data.fileId);
      return;
    }
    if (job.name === BRANDING_LOGO_RECONCILE_JOB) {
      await this.processCleanup.reconcile();
    }
  }
}

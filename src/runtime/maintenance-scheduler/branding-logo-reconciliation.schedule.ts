import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BullmqService } from '../../infrastructure/queue/bullmq.service';
import {
  BRANDING_LOGO_CLEANUP_QUEUE,
  BRANDING_LOGO_RECONCILE_INTERVAL_MS,
  BRANDING_LOGO_RECONCILE_JOB,
} from '../../modules/settings/branding/domain/branding-logo.constants';

@Injectable()
export class BrandingLogoReconciliationSchedule implements OnModuleInit {
  private readonly logger = new Logger(
    BrandingLogoReconciliationSchedule.name,
  );

  constructor(private readonly queue: BullmqService) {}

  async onModuleInit(): Promise<void> {
    await this.queue.registerRepeatJob(
      BRANDING_LOGO_CLEANUP_QUEUE,
      BRANDING_LOGO_RECONCILE_JOB,
      { requestedAt: new Date().toISOString() },
      {
        jobId: BRANDING_LOGO_RECONCILE_JOB,
        repeat: { every: BRANDING_LOGO_RECONCILE_INTERVAL_MS },
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    );
    this.logger.log({
      event: 'maintenance.schedule.registered',
      queue: BRANDING_LOGO_CLEANUP_QUEUE,
      job: BRANDING_LOGO_RECONCILE_JOB,
    });
  }
}

import { Module, type Provider } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { BrandingLogoReconciliationSchedule } from './branding-logo-reconciliation.schedule';
import { DismissalExpirySchedule } from './dismissal-expiry.schedule';
import { LearningMediaCleanupSchedule } from './learning-media-cleanup.schedule';

export const MAINTENANCE_SCHEDULE_PROVIDERS = Object.freeze([
  DismissalExpirySchedule,
  LearningMediaCleanupSchedule,
  BrandingLogoReconciliationSchedule,
] satisfies Provider[]);

@Module({
  imports: [QueueModule],
  providers: [...MAINTENANCE_SCHEDULE_PROVIDERS],
})
export class MaintenanceSchedulesModule {}

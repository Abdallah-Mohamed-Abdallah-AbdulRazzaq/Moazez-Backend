import { Module, type Provider } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { BrandingLogoReconciliationSchedule } from './branding-logo-reconciliation.schedule';
import { DismissalExpirySchedule } from './dismissal-expiry.schedule';
import { LearningMediaCleanupSchedule } from './learning-media-cleanup.schedule';
import { CommunicationNotificationReconciliationSchedule } from './communication-notification-reconciliation.schedule';
import { CommunicationPushReconciliationSchedule } from './communication-push-reconciliation.schedule';
import { ImportValidationReconciliationSchedule } from './import-validation-reconciliation.schedule';
import { SchoolEmailDeliveryReconciliationSchedule } from './school-email-delivery-reconciliation.schedule';

export const MAINTENANCE_SCHEDULE_PROVIDERS = Object.freeze([
  DismissalExpirySchedule,
  LearningMediaCleanupSchedule,
  BrandingLogoReconciliationSchedule,
  CommunicationNotificationReconciliationSchedule,
  CommunicationPushReconciliationSchedule,
  SchoolEmailDeliveryReconciliationSchedule,
  ImportValidationReconciliationSchedule,
] satisfies Provider[]);

@Module({
  imports: [QueueModule],
  providers: [...MAINTENANCE_SCHEDULE_PROVIDERS],
})
export class MaintenanceSchedulesModule {}

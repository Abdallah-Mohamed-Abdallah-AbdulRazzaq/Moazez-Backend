import { Module, type Provider } from '@nestjs/common';
import { FirebaseAdminModule } from '../../infrastructure/push/firebase/firebase-admin.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { RealtimeEmitterModule } from '../../infrastructure/realtime/realtime-emitter.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { AppDeviceTokenCrypto } from '../../modules/app-device-tokens/domain/app-device-token-crypto';
import { AppDeviceTokenRepository } from '../../modules/app-device-tokens/infrastructure/app-device-token.repository';
import { CommunicationNotificationGenerationService } from '../../modules/communication/application/communication-notification-generation.service';
import { CommunicationNotificationPreferenceService } from '../../modules/communication/application/communication-notification-preference.service';
import { CommunicationNotificationPushDeliveryService } from '../../modules/communication/application/communication-notification-push-delivery.service';
import { CommunicationNotificationPushPayloadBuilder } from '../../modules/communication/application/communication-notification-push-payload.builder';
import { CommunicationNotificationPushQueueService } from '../../modules/communication/application/communication-notification-push-queue.service';
import { CommunicationRealtimeEventsService } from '../../modules/communication/application/communication-realtime-events.service';
import { CommunicationNotificationGenerationRepository } from '../../modules/communication/infrastructure/communication-notification-generation.repository';
import { CommunicationNotificationGenerationWorker } from '../../modules/communication/infrastructure/communication-notification-generation.worker';
import { CommunicationNotificationPreferenceRepository } from '../../modules/communication/infrastructure/communication-notification-preference.repository';
import { CommunicationNotificationPushRepository } from '../../modules/communication/infrastructure/communication-notification-push.repository';
import { CommunicationNotificationPushWorker } from '../../modules/communication/infrastructure/communication-notification-push.worker';
import { DismissalPushNotificationService } from '../../modules/dismissal/notifications/application/dismissal-push-notification.service';
import { DismissalPushNotificationRepository } from '../../modules/dismissal/notifications/infrastructure/dismissal-push-notification.repository';
import { DismissalRealtimeEventsService } from '../../modules/dismissal/realtime/dismissal-realtime-events.service';
import { DismissalRealtimeRepository } from '../../modules/dismissal/realtime/dismissal-realtime.repository';
import { ExpireDismissalRequestsUseCase } from '../../modules/dismissal/requests/application/expire-dismissal-requests.use-case';
import { DismissalRequestsExpiryRepository } from '../../modules/dismissal/requests/infrastructure/dismissal-requests-expiry.repository';
import { DismissalRequestExpiryWorker } from '../../modules/dismissal/requests/worker/dismissal-request-expiry.worker';
import { ProcessImportValidationUseCase } from '../../modules/files/imports/application/process-import-validation.use-case';
import { ImportJobsRepository } from '../../modules/files/imports/infrastructure/import-jobs.repository';
import { ImportValidationWorker } from '../../modules/files/imports/infrastructure/import-validation.worker';
import { AuthRepository } from '../../modules/iam/auth/infrastructure/auth.repository';
import { PasswordService } from '../../modules/iam/auth/domain/password.service';
import { BrandingLogoCleanupQueueService } from '../../modules/settings/branding/application/branding-logo-cleanup-queue.service';
import { ProcessBrandingLogoCleanupUseCase } from '../../modules/settings/branding/application/process-branding-logo-cleanup.use-case';
import { ResolveSchoolLogoUrlService } from '../../modules/settings/branding/application/resolve-school-logo-url.service';
import { BrandingLogoCleanupWorker } from '../../modules/settings/branding/infrastructure/branding-logo-cleanup.worker';
import { BrandingRepository } from '../../modules/settings/branding/infrastructure/branding.repository';
import { ProcessEmailDeliveryRecipientUseCase } from '../../modules/settings/email/delivery/application/process-email-delivery-recipient.use-case';
import { SchoolEmailRendererService } from '../../modules/settings/email/delivery/application/school-email-renderer.service';
import { EmailDeliveryRepository } from '../../modules/settings/email/delivery/infrastructure/email-delivery.repository';
import { SchoolEmailDeliveryWorker } from '../../modules/settings/email/delivery/infrastructure/school-email-delivery.worker';
import { SCHOOL_EMAIL_TRANSPORT } from '../../modules/settings/email/delivery/transport/email-transport';
import { NodemailerEmailTransport } from '../../modules/settings/email/delivery/transport/nodemailer-email.transport';
import { EmailSecretCrypto } from '../../modules/settings/email/domain/email-secret-crypto';
import { EmailSettingsRepository } from '../../modules/settings/email/infrastructure/email-settings.repository';
import { UserCredentialsRepository } from '../../modules/settings/users/credentials/infrastructure/user-credentials.repository';

export const CORE_WORKER_CONSUMER_PROVIDERS = Object.freeze([
  CommunicationNotificationGenerationWorker,
  CommunicationNotificationPushWorker,
  SchoolEmailDeliveryWorker,
  ImportValidationWorker,
  DismissalRequestExpiryWorker,
  BrandingLogoCleanupWorker,
] satisfies Provider[]);

const CORE_WORKER_SUPPORT_PROVIDERS: Provider[] = [
  AppDeviceTokenCrypto,
  AppDeviceTokenRepository,
  CommunicationNotificationGenerationRepository,
  CommunicationNotificationPreferenceRepository,
  CommunicationNotificationPushRepository,
  CommunicationNotificationGenerationService,
  CommunicationNotificationPreferenceService,
  CommunicationNotificationPushDeliveryService,
  CommunicationNotificationPushPayloadBuilder,
  CommunicationNotificationPushQueueService,
  CommunicationRealtimeEventsService,
  EmailDeliveryRepository,
  EmailSettingsRepository,
  UserCredentialsRepository,
  PasswordService,
  AuthRepository,
  SchoolEmailRendererService,
  EmailSecretCrypto,
  {
    provide: SCHOOL_EMAIL_TRANSPORT,
    useClass: NodemailerEmailTransport,
  },
  ProcessEmailDeliveryRecipientUseCase,
  ImportJobsRepository,
  ProcessImportValidationUseCase,
  DismissalRequestsExpiryRepository,
  DismissalRealtimeRepository,
  DismissalRealtimeEventsService,
  DismissalPushNotificationRepository,
  DismissalPushNotificationService,
  ExpireDismissalRequestsUseCase,
  BrandingRepository,
  ResolveSchoolLogoUrlService,
  BrandingLogoCleanupQueueService,
  ProcessBrandingLogoCleanupUseCase,
];

@Module({
  imports: [
    FirebaseAdminModule,
    QueueModule,
    RealtimeEmitterModule,
    StorageModule,
  ],
  providers: [
    ...CORE_WORKER_SUPPORT_PROVIDERS,
    ...CORE_WORKER_CONSUMER_PROVIDERS,
  ],
})
export class CoreWorkerConsumersModule {}

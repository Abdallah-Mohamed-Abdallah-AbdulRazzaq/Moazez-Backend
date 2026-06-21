import { Module } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { RealtimeModule } from '../../infrastructure/realtime/realtime.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { AuthModule } from '../iam/auth/auth.module';
import {
  ArchiveCommunicationAnnouncementUseCase,
  CancelCommunicationAnnouncementUseCase,
  CreateCommunicationAnnouncementUseCase,
  DeleteCommunicationAnnouncementAttachmentUseCase,
  GetCommunicationAnnouncementReadSummaryUseCase,
  GetCommunicationAnnouncementUseCase,
  LinkCommunicationAnnouncementAttachmentUseCase,
  ListCommunicationAnnouncementAttachmentsUseCase,
  ListCommunicationAnnouncementsUseCase,
  MarkCommunicationAnnouncementReadUseCase,
  PublishCommunicationAnnouncementUseCase,
  UpdateCommunicationAnnouncementUseCase,
} from './application/communication-announcement.use-cases';
import {
  ArchiveCommunicationNotificationUseCase,
  GetCommunicationNotificationDeliveryUseCase,
  GetCommunicationNotificationUseCase,
  ListCommunicationNotificationDeliveriesUseCase,
  ListCommunicationNotificationsUseCase,
  MarkAllCommunicationNotificationsReadUseCase,
  MarkCommunicationNotificationReadUseCase,
} from './application/communication-notification.use-cases';
import { CommunicationNotificationGenerationService } from './application/communication-notification-generation.service';
import { CommunicationNotificationPreferenceService } from './application/communication-notification-preference.service';
import { CommunicationNotificationQueueService } from './application/communication-notification-queue.service';
import {
  ArchiveCommunicationConversationUseCase,
  CloseCommunicationConversationUseCase,
  CreateCommunicationConversationUseCase,
  CreateOrReuseCommunicationDirectConversationUseCase,
  GetCommunicationConversationUseCase,
  ListCommunicationConversationsUseCase,
  ReopenCommunicationConversationUseCase,
  UpdateCommunicationConversationUseCase,
} from './application/communication-conversation.use-cases';
import {
  AcceptCommunicationInviteUseCase,
  AddCommunicationParticipantUseCase,
  ApproveCommunicationJoinRequestUseCase,
  CreateCommunicationInviteUseCase,
  CreateCommunicationJoinRequestUseCase,
  DemoteCommunicationParticipantUseCase,
  LeaveCommunicationConversationUseCase,
  ListCommunicationInvitesUseCase,
  ListCommunicationJoinRequestsUseCase,
  ListCommunicationParticipantsUseCase,
  PromoteCommunicationParticipantUseCase,
  RejectCommunicationInviteUseCase,
  RejectCommunicationJoinRequestUseCase,
  RemoveCommunicationParticipantUseCase,
  UpdateCommunicationParticipantUseCase,
} from './application/communication-participant.use-cases';
import {
  CreateCommunicationMessageUseCase,
  DeleteCommunicationMessageUseCase,
  GetCommunicationMessageInfoUseCase,
  GetCommunicationMessageUseCase,
  GetCommunicationMessageReadersUseCase,
  GetCommunicationReadSummaryUseCase,
  ListCommunicationMessagesUseCase,
  MarkCommunicationConversationReadUseCase,
  MarkCommunicationMessageReadUseCase,
  UpdateCommunicationMessageUseCase,
} from './application/communication-message.use-cases';
import {
  DeleteCommunicationMessageAttachmentUseCase,
  LinkCommunicationMessageAttachmentUseCase,
  ListCommunicationMessageAttachmentsUseCase,
} from './application/communication-message-attachment.use-cases';
import { GetCommunicationMessageAttachmentDownloadUrlUseCase } from './application/communication-message-attachment-download.use-case';
import {
  CreateCommunicationUserBlockUseCase,
  DeleteCommunicationUserBlockUseCase,
  ListCommunicationUserBlocksUseCase,
} from './application/communication-block.use-cases';
import {
  CreateCommunicationModerationActionUseCase,
  ListCommunicationModerationActionsUseCase,
} from './application/communication-moderation.use-cases';
import {
  GetCommunicationAdminOverviewUseCase,
  GetCommunicationPolicyUseCase,
  UpdateCommunicationPolicyUseCase,
} from './application/communication-policy.use-cases';
import {
  CreateCommunicationMessageReportUseCase,
  GetCommunicationMessageReportUseCase,
  ListCommunicationMessageReportsUseCase,
  UpdateCommunicationMessageReportUseCase,
} from './application/communication-report.use-cases';
import {
  DeleteCommunicationMessageReactionUseCase,
  ListCommunicationMessageReactionsUseCase,
  UpsertCommunicationMessageReactionUseCase,
} from './application/communication-reaction.use-cases';
import { CommunicationRealtimeEventsService } from './application/communication-realtime-events.service';
import { CommunicationAppNotificationCenterService } from './application/communication-app-notification-center.service';
import {
  CreateCommunicationUserRestrictionUseCase,
  ListCommunicationUserRestrictionsUseCase,
  RevokeCommunicationUserRestrictionUseCase,
  UpdateCommunicationUserRestrictionUseCase,
} from './application/communication-restriction.use-cases';
import { CommunicationConversationController } from './controller/communication-conversation.controller';
import { CommunicationAnnouncementController } from './controller/communication-announcement.controller';
import { CommunicationMessageInteractionsController } from './controller/communication-message-interactions.controller';
import { CommunicationMessageController } from './controller/communication-message.controller';
import { CommunicationNotificationController } from './controller/communication-notification.controller';
import { CommunicationParticipantController } from './controller/communication-participant.controller';
import { CommunicationPolicyController } from './controller/communication-policy.controller';
import { CommunicationSafetyController } from './controller/communication-safety.controller';
import { CommunicationBlockRepository } from './infrastructure/communication-block.repository';
import { CommunicationAnnouncementRepository } from './infrastructure/communication-announcement.repository';
import { CommunicationNotificationGenerationRepository } from './infrastructure/communication-notification-generation.repository';
import { CommunicationNotificationPreferenceRepository } from './infrastructure/communication-notification-preference.repository';
import { CommunicationNotificationGenerationWorker } from './infrastructure/communication-notification-generation.worker';
import { CommunicationConversationRepository } from './infrastructure/communication-conversation.repository';
import { CommunicationModerationRepository } from './infrastructure/communication-moderation.repository';
import { CommunicationMessageRepository } from './infrastructure/communication-message.repository';
import { CommunicationMessageAttachmentRepository } from './infrastructure/communication-message-attachment.repository';
import { CommunicationParticipantRepository } from './infrastructure/communication-participant.repository';
import { CommunicationPolicyRepository } from './infrastructure/communication-policy.repository';
import { CommunicationReactionRepository } from './infrastructure/communication-reaction.repository';
import { CommunicationReportRepository } from './infrastructure/communication-report.repository';
import { CommunicationRestrictionRepository } from './infrastructure/communication-restriction.repository';
import { CommunicationNotificationRepository } from './infrastructure/communication-notification.repository';

@Module({
  imports: [AuthModule, QueueModule, RealtimeModule, StorageModule],
  controllers: [
    CommunicationPolicyController,
    CommunicationAnnouncementController,
    CommunicationConversationController,
    CommunicationParticipantController,
    CommunicationMessageController,
    CommunicationMessageInteractionsController,
    CommunicationNotificationController,
    CommunicationSafetyController,
  ],
  providers: [
    CommunicationPolicyRepository,
    CommunicationAnnouncementRepository,
    CommunicationConversationRepository,
    CommunicationParticipantRepository,
    CommunicationMessageRepository,
    CommunicationReactionRepository,
    CommunicationMessageAttachmentRepository,
    CommunicationReportRepository,
    CommunicationModerationRepository,
    CommunicationBlockRepository,
    CommunicationRestrictionRepository,
    CommunicationNotificationRepository,
    CommunicationNotificationGenerationRepository,
    CommunicationNotificationPreferenceRepository,
    GetCommunicationPolicyUseCase,
    UpdateCommunicationPolicyUseCase,
    GetCommunicationAdminOverviewUseCase,
    ListCommunicationAnnouncementsUseCase,
    CreateCommunicationAnnouncementUseCase,
    GetCommunicationAnnouncementUseCase,
    UpdateCommunicationAnnouncementUseCase,
    PublishCommunicationAnnouncementUseCase,
    ArchiveCommunicationAnnouncementUseCase,
    CancelCommunicationAnnouncementUseCase,
    MarkCommunicationAnnouncementReadUseCase,
    GetCommunicationAnnouncementReadSummaryUseCase,
    ListCommunicationAnnouncementAttachmentsUseCase,
    LinkCommunicationAnnouncementAttachmentUseCase,
    DeleteCommunicationAnnouncementAttachmentUseCase,
    ListCommunicationConversationsUseCase,
    CreateCommunicationConversationUseCase,
    CreateOrReuseCommunicationDirectConversationUseCase,
    GetCommunicationConversationUseCase,
    UpdateCommunicationConversationUseCase,
    ArchiveCommunicationConversationUseCase,
    CloseCommunicationConversationUseCase,
    ReopenCommunicationConversationUseCase,
    ListCommunicationParticipantsUseCase,
    AddCommunicationParticipantUseCase,
    UpdateCommunicationParticipantUseCase,
    RemoveCommunicationParticipantUseCase,
    LeaveCommunicationConversationUseCase,
    PromoteCommunicationParticipantUseCase,
    DemoteCommunicationParticipantUseCase,
    ListCommunicationInvitesUseCase,
    CreateCommunicationInviteUseCase,
    AcceptCommunicationInviteUseCase,
    RejectCommunicationInviteUseCase,
    ListCommunicationJoinRequestsUseCase,
    CreateCommunicationJoinRequestUseCase,
    ApproveCommunicationJoinRequestUseCase,
    RejectCommunicationJoinRequestUseCase,
    ListCommunicationMessagesUseCase,
    CreateCommunicationMessageUseCase,
    GetCommunicationMessageUseCase,
    GetCommunicationMessageReadersUseCase,
    GetCommunicationMessageInfoUseCase,
    UpdateCommunicationMessageUseCase,
    DeleteCommunicationMessageUseCase,
    MarkCommunicationMessageReadUseCase,
    MarkCommunicationConversationReadUseCase,
    GetCommunicationReadSummaryUseCase,
    ListCommunicationMessageReactionsUseCase,
    UpsertCommunicationMessageReactionUseCase,
    DeleteCommunicationMessageReactionUseCase,
    ListCommunicationMessageAttachmentsUseCase,
    GetCommunicationMessageAttachmentDownloadUrlUseCase,
    LinkCommunicationMessageAttachmentUseCase,
    DeleteCommunicationMessageAttachmentUseCase,
    CreateCommunicationMessageReportUseCase,
    ListCommunicationMessageReportsUseCase,
    GetCommunicationMessageReportUseCase,
    UpdateCommunicationMessageReportUseCase,
    ListCommunicationModerationActionsUseCase,
    CreateCommunicationModerationActionUseCase,
    ListCommunicationUserBlocksUseCase,
    CreateCommunicationUserBlockUseCase,
    DeleteCommunicationUserBlockUseCase,
    ListCommunicationUserRestrictionsUseCase,
    CreateCommunicationUserRestrictionUseCase,
    UpdateCommunicationUserRestrictionUseCase,
    RevokeCommunicationUserRestrictionUseCase,
    ListCommunicationNotificationsUseCase,
    GetCommunicationNotificationUseCase,
    MarkCommunicationNotificationReadUseCase,
    MarkAllCommunicationNotificationsReadUseCase,
    ArchiveCommunicationNotificationUseCase,
    ListCommunicationNotificationDeliveriesUseCase,
    GetCommunicationNotificationDeliveryUseCase,
    CommunicationNotificationGenerationService,
    CommunicationNotificationPreferenceService,
    CommunicationNotificationQueueService,
    CommunicationNotificationGenerationWorker,
    CommunicationRealtimeEventsService,
    CommunicationAppNotificationCenterService,
  ],
  exports: [
    CreateCommunicationAnnouncementUseCase,
    UpdateCommunicationAnnouncementUseCase,
    PublishCommunicationAnnouncementUseCase,
    ArchiveCommunicationAnnouncementUseCase,
    CreateOrReuseCommunicationDirectConversationUseCase,
    CreateCommunicationMessageUseCase,
    GetCommunicationMessageAttachmentDownloadUrlUseCase,
    GetCommunicationMessageReadersUseCase,
    GetCommunicationMessageInfoUseCase,
    MarkCommunicationConversationReadUseCase,
    CommunicationAppNotificationCenterService,
    CommunicationNotificationPreferenceService,
  ],
})
export class CommunicationModule {}

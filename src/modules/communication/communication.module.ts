import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import {
  ArchiveCommunicationConversationUseCase,
  CloseCommunicationConversationUseCase,
  CreateCommunicationConversationUseCase,
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
  GetCommunicationMessageUseCase,
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
import {
  GetCommunicationAdminOverviewUseCase,
  GetCommunicationPolicyUseCase,
  UpdateCommunicationPolicyUseCase,
} from './application/communication-policy.use-cases';
import {
  DeleteCommunicationMessageReactionUseCase,
  ListCommunicationMessageReactionsUseCase,
  UpsertCommunicationMessageReactionUseCase,
} from './application/communication-reaction.use-cases';
import { CommunicationConversationController } from './controller/communication-conversation.controller';
import { CommunicationMessageInteractionsController } from './controller/communication-message-interactions.controller';
import { CommunicationMessageController } from './controller/communication-message.controller';
import { CommunicationParticipantController } from './controller/communication-participant.controller';
import { CommunicationPolicyController } from './controller/communication-policy.controller';
import { CommunicationConversationRepository } from './infrastructure/communication-conversation.repository';
import { CommunicationMessageRepository } from './infrastructure/communication-message.repository';
import { CommunicationMessageAttachmentRepository } from './infrastructure/communication-message-attachment.repository';
import { CommunicationParticipantRepository } from './infrastructure/communication-participant.repository';
import { CommunicationPolicyRepository } from './infrastructure/communication-policy.repository';
import { CommunicationReactionRepository } from './infrastructure/communication-reaction.repository';

@Module({
  imports: [AuthModule],
  controllers: [
    CommunicationPolicyController,
    CommunicationConversationController,
    CommunicationParticipantController,
    CommunicationMessageController,
    CommunicationMessageInteractionsController,
  ],
  providers: [
    CommunicationPolicyRepository,
    CommunicationConversationRepository,
    CommunicationParticipantRepository,
    CommunicationMessageRepository,
    CommunicationReactionRepository,
    CommunicationMessageAttachmentRepository,
    GetCommunicationPolicyUseCase,
    UpdateCommunicationPolicyUseCase,
    GetCommunicationAdminOverviewUseCase,
    ListCommunicationConversationsUseCase,
    CreateCommunicationConversationUseCase,
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
    UpdateCommunicationMessageUseCase,
    DeleteCommunicationMessageUseCase,
    MarkCommunicationMessageReadUseCase,
    MarkCommunicationConversationReadUseCase,
    GetCommunicationReadSummaryUseCase,
    ListCommunicationMessageReactionsUseCase,
    UpsertCommunicationMessageReactionUseCase,
    DeleteCommunicationMessageReactionUseCase,
    ListCommunicationMessageAttachmentsUseCase,
    LinkCommunicationMessageAttachmentUseCase,
    DeleteCommunicationMessageAttachmentUseCase,
  ],
})
export class CommunicationModule {}

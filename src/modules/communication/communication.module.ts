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
  GetCommunicationAdminOverviewUseCase,
  GetCommunicationPolicyUseCase,
  UpdateCommunicationPolicyUseCase,
} from './application/communication-policy.use-cases';
import { CommunicationConversationController } from './controller/communication-conversation.controller';
import { CommunicationParticipantController } from './controller/communication-participant.controller';
import { CommunicationPolicyController } from './controller/communication-policy.controller';
import { CommunicationConversationRepository } from './infrastructure/communication-conversation.repository';
import { CommunicationParticipantRepository } from './infrastructure/communication-participant.repository';
import { CommunicationPolicyRepository } from './infrastructure/communication-policy.repository';

@Module({
  imports: [AuthModule],
  controllers: [
    CommunicationPolicyController,
    CommunicationConversationController,
    CommunicationParticipantController,
  ],
  providers: [
    CommunicationPolicyRepository,
    CommunicationConversationRepository,
    CommunicationParticipantRepository,
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
  ],
})
export class CommunicationModule {}

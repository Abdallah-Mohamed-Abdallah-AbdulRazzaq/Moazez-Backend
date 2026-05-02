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
  GetCommunicationAdminOverviewUseCase,
  GetCommunicationPolicyUseCase,
  UpdateCommunicationPolicyUseCase,
} from './application/communication-policy.use-cases';
import { CommunicationConversationController } from './controller/communication-conversation.controller';
import { CommunicationPolicyController } from './controller/communication-policy.controller';
import { CommunicationConversationRepository } from './infrastructure/communication-conversation.repository';
import { CommunicationPolicyRepository } from './infrastructure/communication-policy.repository';

@Module({
  imports: [AuthModule],
  controllers: [
    CommunicationPolicyController,
    CommunicationConversationController,
  ],
  providers: [
    CommunicationPolicyRepository,
    CommunicationConversationRepository,
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
  ],
})
export class CommunicationModule {}

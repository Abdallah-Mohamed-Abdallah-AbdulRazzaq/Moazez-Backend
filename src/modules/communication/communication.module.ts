import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import {
  GetCommunicationAdminOverviewUseCase,
  GetCommunicationPolicyUseCase,
  UpdateCommunicationPolicyUseCase,
} from './application/communication-policy.use-cases';
import { CommunicationPolicyController } from './controller/communication-policy.controller';
import { CommunicationPolicyRepository } from './infrastructure/communication-policy.repository';

@Module({
  imports: [AuthModule],
  controllers: [CommunicationPolicyController],
  providers: [
    CommunicationPolicyRepository,
    GetCommunicationPolicyUseCase,
    UpdateCommunicationPolicyUseCase,
    GetCommunicationAdminOverviewUseCase,
  ],
})
export class CommunicationModule {}

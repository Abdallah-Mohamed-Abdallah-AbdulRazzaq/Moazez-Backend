import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import {
  ApproveProfileCorrectionRequestUseCase,
  GetStaffProfileCorrectionRequestUseCase,
  ListStaffProfileCorrectionRequestsUseCase,
  RejectProfileCorrectionRequestUseCase,
} from './application/staff-profile-correction-requests.use-cases';
import { ProfileCorrectionRequestsController } from './controller/profile-correction-requests.controller';
import { ProfileCorrectionRequestsRepository } from './infrastructure/profile-correction-requests.repository';

@Module({
  imports: [AuthModule],
  controllers: [ProfileCorrectionRequestsController],
  providers: [
    ProfileCorrectionRequestsRepository,
    ListStaffProfileCorrectionRequestsUseCase,
    GetStaffProfileCorrectionRequestUseCase,
    ApproveProfileCorrectionRequestUseCase,
    RejectProfileCorrectionRequestUseCase,
  ],
  exports: [ProfileCorrectionRequestsRepository],
})
export class ProfileCorrectionRequestsModule {}

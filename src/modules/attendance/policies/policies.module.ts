import { Module } from '@nestjs/common';
import { CreateAttendancePolicyUseCase } from './application/create-attendance-policy.use-case';
import { DeleteAttendancePolicyUseCase } from './application/delete-attendance-policy.use-case';
import { GetEffectiveAttendancePolicyUseCase } from './application/get-effective-attendance-policy.use-case';
import { ListAttendancePoliciesUseCase } from './application/list-attendance-policies.use-case';
import { UpdateAttendancePolicyUseCase } from './application/update-attendance-policy.use-case';
import { ValidateAttendancePolicyNameUseCase } from './application/validate-attendance-policy-name.use-case';
import { AttendancePoliciesController } from './controller/attendance-policies.controller';
import { AttendancePoliciesRepository } from './infrastructure/attendance-policies.repository';

@Module({
  controllers: [AttendancePoliciesController],
  providers: [
    AttendancePoliciesRepository,
    ListAttendancePoliciesUseCase,
    CreateAttendancePolicyUseCase,
    UpdateAttendancePolicyUseCase,
    DeleteAttendancePolicyUseCase,
    GetEffectiveAttendancePolicyUseCase,
    ValidateAttendancePolicyNameUseCase,
  ],
})
export class PoliciesModule {}

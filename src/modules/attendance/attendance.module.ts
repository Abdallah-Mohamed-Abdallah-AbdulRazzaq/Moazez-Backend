import { Module } from '@nestjs/common';
import { PoliciesModule } from './policies/policies.module';
import { RollCallModule } from './roll-call/roll-call.module';

@Module({
  imports: [PoliciesModule, RollCallModule],
})
export class AttendanceModule {}

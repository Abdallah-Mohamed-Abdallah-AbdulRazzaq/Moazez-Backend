import { Module } from '@nestjs/common';
import { AbsencesModule } from './absences/absences.module';
import { PoliciesModule } from './policies/policies.module';
import { ReportsModule } from './reports/reports.module';
import { RollCallModule } from './roll-call/roll-call.module';

@Module({
  imports: [PoliciesModule, RollCallModule, AbsencesModule, ReportsModule],
})
export class AttendanceModule {}

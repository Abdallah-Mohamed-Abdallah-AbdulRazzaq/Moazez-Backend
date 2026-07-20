import { Module } from '@nestjs/common';
import { TeacherLifecycleModule } from '../../teachers/lifecycle/teacher-lifecycle.module';
import { TransferTeacherBetweenSchoolsCoordinator } from './application/transfer-teacher-between-schools.coordinator';
import { OrganizationTeacherTransfersController } from './controller/organization-teacher-transfers.controller';

@Module({
  imports: [TeacherLifecycleModule],
  controllers: [OrganizationTeacherTransfersController],
  providers: [TransferTeacherBetweenSchoolsCoordinator],
})
export class OrganizationTeacherTransfersModule {}

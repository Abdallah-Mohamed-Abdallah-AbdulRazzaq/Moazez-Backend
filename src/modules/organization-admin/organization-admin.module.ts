import { Module } from '@nestjs/common';
import { OrganizationTeacherTransfersModule } from './teacher-transfers/organization-teacher-transfers.module';

@Module({ imports: [OrganizationTeacherTransfersModule] })
export class OrganizationAdminModule {}

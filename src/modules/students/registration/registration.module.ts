import { Module } from '@nestjs/common';
import { TermsRepository } from '../../academics/structure/infrastructure/terms.repository';
import { StructureRepository } from '../../academics/structure/infrastructure/structure.repository';
import { AuthModule } from '../../iam/auth/auth.module';
import { PlatformAdminModule } from '../../platform-admin/platform-admin.module';
import { EnrollmentsRepository } from '../enrollments/infrastructure/enrollments.repository';
import { GuardiansModule } from '../guardians/guardians.module';
import { StudentsRecordsModule } from '../students/students.module';
import { CreateSchoolRegistrationUseCase } from './application/create-school-registration.use-case';
import { SchoolRegistrationController } from './controller/school-registration.controller';
import { SchoolRegistrationRepository } from './infrastructure/school-registration.repository';

@Module({
  imports: [
    AuthModule,
    PlatformAdminModule,
    StudentsRecordsModule,
    GuardiansModule,
  ],
  controllers: [SchoolRegistrationController],
  providers: [
    SchoolRegistrationRepository,
    EnrollmentsRepository,
    StructureRepository,
    TermsRepository,
    CreateSchoolRegistrationUseCase,
  ],
  exports: [CreateSchoolRegistrationUseCase],
})
export class RegistrationModule {}

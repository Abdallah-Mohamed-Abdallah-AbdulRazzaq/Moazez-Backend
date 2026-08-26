import { Module } from '@nestjs/common';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { UploadsModule } from '../../files/uploads/uploads.module';
import { TermsRepository } from '../../academics/structure/infrastructure/terms.repository';
import { StructureRepository } from '../../academics/structure/infrastructure/structure.repository';
import { AuthModule } from '../../iam/auth/auth.module';
import { PlatformAdminModule } from '../../platform-admin/platform-admin.module';
import { EnrollmentsRepository } from '../enrollments/infrastructure/enrollments.repository';
import { StudentPlacementCapacityPolicyService } from '../enrollments/domain/student-placement-capacity-policy.service';
import { GuardiansModule } from '../guardians/guardians.module';
import { StudentsRecordsModule } from '../students/students.module';
import { CreateSchoolRegistrationUseCase } from './application/create-school-registration.use-case';
import { CreateStudentBulkRegistrationUseCase } from './application/create-student-bulk-registration.use-case';
import { GetStudentBulkRegistrationTemplateUseCase } from './application/get-student-bulk-registration-template.use-case';
import { StudentBulkRegistrationPreflightUseCase } from './application/student-bulk-registration-preflight.use-case';
import { SchoolRegistrationController } from './controller/school-registration.controller';
import { StudentBulkRegistrationController } from './controller/student-bulk-registration.controller';
import { StudentBulkRegistrationPlacementService } from './domain/student-bulk-registration-placement.service';
import { SchoolRegistrationRepository } from './infrastructure/school-registration.repository';
import { StudentBulkRegistrationRepository } from './infrastructure/student-bulk-registration.repository';

@Module({
  imports: [
    AuthModule,
    PlatformAdminModule,
    StudentsRecordsModule,
    GuardiansModule,
    StorageModule,
    UploadsModule,
  ],
  controllers: [
    SchoolRegistrationController,
    StudentBulkRegistrationController,
  ],
  providers: [
    SchoolRegistrationRepository,
    StudentBulkRegistrationRepository,
    EnrollmentsRepository,
    StudentPlacementCapacityPolicyService,
    StructureRepository,
    TermsRepository,
    CreateSchoolRegistrationUseCase,
    StudentBulkRegistrationPlacementService,
    StudentBulkRegistrationPreflightUseCase,
    GetStudentBulkRegistrationTemplateUseCase,
    CreateStudentBulkRegistrationUseCase,
  ],
  exports: [CreateSchoolRegistrationUseCase],
})
export class RegistrationModule {}

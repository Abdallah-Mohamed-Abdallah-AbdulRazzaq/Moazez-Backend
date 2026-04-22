import { Module } from '@nestjs/common';
import { EnrollApplicationHandoffUseCase } from '../../admissions/applications/application/enroll-application-handoff.use-case';
import { ApplicationsRepository } from '../../admissions/applications/infrastructure/applications.repository';
import { ApplicationEnrollmentHandoffValidator } from '../../admissions/applications/validators/application-enrollment-handoff.validator';
import { TermsRepository } from '../../academics/structure/infrastructure/terms.repository';
import { StructureRepository } from '../../academics/structure/infrastructure/structure.repository';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { StudentsRecordsModule } from '../students/students.module';
import { CreateEnrollmentUseCase } from './application/create-enrollment.use-case';
import { GetCurrentEnrollmentUseCase } from './application/get-current-enrollment.use-case';
import { GetEnrollmentUseCase } from './application/get-enrollment.use-case';
import { ListEnrollmentAcademicYearsUseCase } from './application/list-enrollment-academic-years.use-case';
import { ListEnrollmentHistoryUseCase } from './application/list-enrollment-history.use-case';
import { ListEnrollmentsUseCase } from './application/list-enrollments.use-case';
import { UpsertEnrollmentUseCase } from './application/upsert-enrollment.use-case';
import { ValidateEnrollmentUseCase } from './application/validate-enrollment.use-case';
import { EnrollmentsController } from './controller/enrollments.controller';
import { EnrollmentPlacementService } from './domain/enrollment-placement.service';
import { EnrollmentsRepository } from './infrastructure/enrollments.repository';

@Module({
  imports: [StudentsRecordsModule],
  controllers: [EnrollmentsController],
  providers: [
    EnrollmentsRepository,
    StructureRepository,
    TermsRepository,
    ApplicationsRepository,
    ApplicationEnrollmentHandoffValidator,
    EnrollApplicationHandoffUseCase,
    AuthRepository,
    EnrollmentPlacementService,
    ListEnrollmentsUseCase,
    CreateEnrollmentUseCase,
    UpsertEnrollmentUseCase,
    GetEnrollmentUseCase,
    GetCurrentEnrollmentUseCase,
    ListEnrollmentHistoryUseCase,
    ListEnrollmentAcademicYearsUseCase,
    ValidateEnrollmentUseCase,
  ],
})
export class EnrollmentsModule {}

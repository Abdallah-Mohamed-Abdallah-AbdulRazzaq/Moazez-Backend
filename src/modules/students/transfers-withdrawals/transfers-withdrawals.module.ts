import { Module } from '@nestjs/common';
import { TermsRepository } from '../../academics/structure/infrastructure/terms.repository';
import { StructureRepository } from '../../academics/structure/infrastructure/structure.repository';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { EnrollmentsRepository } from '../enrollments/infrastructure/enrollments.repository';
import { EnrollmentPlacementService } from '../enrollments/domain/enrollment-placement.service';
import { StudentsRecordsModule } from '../students/students.module';
import { PromoteStudentEnrollmentUseCase } from './application/promote-student-enrollment.use-case';
import { TransferStudentEnrollmentUseCase } from './application/transfer-student-enrollment.use-case';
import { WithdrawStudentEnrollmentUseCase } from './application/withdraw-student-enrollment.use-case';
import { EnrollmentLifecycleController } from './controller/enrollment-lifecycle.controller';
import { PromotionPlacementService } from './domain/promotion-placement.service';

@Module({
  imports: [StudentsRecordsModule],
  controllers: [EnrollmentLifecycleController],
  providers: [
    EnrollmentsRepository,
    StructureRepository,
    TermsRepository,
    AuthRepository,
    EnrollmentPlacementService,
    PromotionPlacementService,
    TransferStudentEnrollmentUseCase,
    WithdrawStudentEnrollmentUseCase,
    PromoteStudentEnrollmentUseCase,
  ],
})
export class TransfersWithdrawalsModule {}

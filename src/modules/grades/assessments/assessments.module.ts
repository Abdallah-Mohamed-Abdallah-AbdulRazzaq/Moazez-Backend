import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { CreateGradeAssessmentUseCase } from './application/create-grade-assessment.use-case';
import { DeleteGradeAssessmentUseCase } from './application/delete-grade-assessment.use-case';
import { GetGradeAssessmentUseCase } from './application/get-grade-assessment.use-case';
import { ListGradeAssessmentsUseCase } from './application/list-grade-assessments.use-case';
import { UpdateGradeAssessmentUseCase } from './application/update-grade-assessment.use-case';
import { GradesAssessmentsController } from './controller/grades-assessments.controller';
import { GradesAssessmentsRepository } from './infrastructure/grades-assessments.repository';

@Module({
  imports: [AuthModule],
  controllers: [GradesAssessmentsController],
  providers: [
    GradesAssessmentsRepository,
    ListGradeAssessmentsUseCase,
    GetGradeAssessmentUseCase,
    CreateGradeAssessmentUseCase,
    UpdateGradeAssessmentUseCase,
    DeleteGradeAssessmentUseCase,
  ],
})
export class AssessmentsModule {}

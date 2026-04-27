import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { GetGradesGradebookUseCase } from './application/get-grades-gradebook.use-case';
import { GetStudentGradeSnapshotUseCase } from './application/get-student-grade-snapshot.use-case';
import { GradesGradebookController } from './controller/grades-gradebook.controller';
import { GradesReadModelRepository } from '../shared/infrastructure/grades-read-model.repository';

@Module({
  imports: [AuthModule],
  controllers: [GradesGradebookController],
  providers: [
    GradesReadModelRepository,
    GetGradesGradebookUseCase,
    GetStudentGradeSnapshotUseCase,
  ],
})
export class GradebookModule {}

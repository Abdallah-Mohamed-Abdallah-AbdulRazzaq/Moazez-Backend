import { Injectable } from '@nestjs/common';
import { requireGradesScope } from '../../grades-context';
import { buildStudentGradeSnapshotModel } from '../../shared/application/grades-read-model.builder';
import { GradesReadModelRepository } from '../../shared/infrastructure/grades-read-model.repository';
import {
  GetStudentGradeSnapshotQueryDto,
  StudentGradeSnapshotResponseDto,
} from '../dto/get-student-grade-snapshot-query.dto';
import { presentStudentGradeSnapshot } from '../presenters/student-grade-snapshot.presenter';

@Injectable()
export class GetStudentGradeSnapshotUseCase {
  constructor(
    private readonly gradesReadModelRepository: GradesReadModelRepository,
  ) {}

  async execute(
    studentId: string,
    query: GetStudentGradeSnapshotQueryDto,
  ): Promise<StudentGradeSnapshotResponseDto> {
    const scope = requireGradesScope();
    const snapshot = await buildStudentGradeSnapshotModel({
      repository: this.gradesReadModelRepository,
      schoolId: scope.schoolId,
      studentId,
      query,
    });

    return presentStudentGradeSnapshot(snapshot);
  }
}

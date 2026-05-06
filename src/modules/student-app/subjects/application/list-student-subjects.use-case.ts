import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentSubjectsListResponseDto } from '../dto/student-subjects.dto';
import { StudentSubjectsReadAdapter } from '../infrastructure/student-subjects-read.adapter';
import { StudentSubjectsPresenter } from '../presenters/student-subjects.presenter';

@Injectable()
export class ListStudentSubjectsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentSubjectsReadAdapter,
  ) {}

  async execute(): Promise<StudentSubjectsListResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const allocations = await this.readAdapter.listCurrentSubjects(context);
    const statsBySubjectId =
      allocations.length === 0
        ? new Map()
        : await this.readAdapter.summarizeSubjectGrades({
            context,
            subjectIds: allocations.map((allocation) => allocation.subjectId),
            classroom: allocations[0].classroom,
          });

    return StudentSubjectsPresenter.presentList({
      allocations,
      statsBySubjectId,
    });
  }
}

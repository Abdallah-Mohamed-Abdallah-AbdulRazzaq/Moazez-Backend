import { Injectable } from '@nestjs/common';
import { DisciplineDerivedReadService } from '../../../discipline/application/discipline-derived-read.service';
import {
  DisciplineDerivedQueryDto,
  DisciplineTimelineListResponseDto,
} from '../../../discipline/dto/discipline-derived.dto';
import { DisciplineDerivedPresenter } from '../../../discipline/presenters/discipline-derived.presenter';
import { StudentAppAccessService } from '../../access/student-app-access.service';

@Injectable()
export class ListStudentDisciplineUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly disciplineReadService: DisciplineDerivedReadService,
  ) {}

  async execute(
    query?: DisciplineDerivedQueryDto,
  ): Promise<DisciplineTimelineListResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.disciplineReadService.listTimeline({
      scope: {
        studentId: context.studentId,
        enrollmentId: context.enrollmentId,
        academicYearId: context.academicYearId,
        termId: context.termId,
      },
      query,
    });

    return DisciplineDerivedPresenter.presentList(result);
  }
}

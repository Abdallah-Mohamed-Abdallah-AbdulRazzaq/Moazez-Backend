import { Injectable } from '@nestjs/common';
import { DisciplineDerivedReadService } from '../../../discipline/application/discipline-derived-read.service';
import {
  DisciplineDerivedQueryDto,
  ParentDisciplineTimelineListResponseDto,
} from '../../../discipline/dto/discipline-derived.dto';
import { DisciplineDerivedPresenter } from '../../../discipline/presenters/discipline-derived.presenter';
import { ParentAppAccessService } from '../../access/parent-app-access.service';

@Injectable()
export class ListParentChildDisciplineUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly disciplineReadService: DisciplineDerivedReadService,
  ) {}

  async execute(
    studentId: string,
    query?: DisciplineDerivedQueryDto,
  ): Promise<ParentDisciplineTimelineListResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.disciplineReadService.listTimeline({
      scope: {
        studentId: child.studentId,
        enrollmentId: child.enrollmentId,
        academicYearId: child.academicYearId,
        termId: child.termId,
      },
      query,
    });

    return DisciplineDerivedPresenter.presentParentList({
      child: {
        studentId: child.studentId,
        enrollmentId: child.enrollmentId,
        student_id: child.studentId,
        enrollment_id: child.enrollmentId,
      },
      result,
    });
  }
}

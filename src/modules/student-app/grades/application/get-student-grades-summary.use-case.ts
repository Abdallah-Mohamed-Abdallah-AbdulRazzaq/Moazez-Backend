import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentGradesQueryDto,
  StudentGradesSummaryResponseDto,
} from '../dto/student-grades.dto';
import { StudentGradesReadAdapter } from '../infrastructure/student-grades-read.adapter';
import { StudentGradesPresenter } from '../presenters/student-grades.presenter';

@Injectable()
export class GetStudentGradesSummaryUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentGradesReadAdapter,
  ) {}

  async execute(
    query: StudentGradesQueryDto,
  ): Promise<StudentGradesSummaryResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.listGrades({
      context,
      query,
      paginate: false,
    });

    return StudentGradesPresenter.presentSummary(result);
  }
}

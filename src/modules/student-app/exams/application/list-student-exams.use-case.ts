import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentExamsListResponseDto, StudentExamsQueryDto } from '../dto/student-exams.dto';
import { StudentExamsReadAdapter } from '../infrastructure/student-exams-read.adapter';
import { StudentExamsPresenter } from '../presenters/student-exams.presenter';

@Injectable()
export class ListStudentExamsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentExamsReadAdapter,
  ) {}

  async execute(query: StudentExamsQueryDto): Promise<StudentExamsListResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.listExams({ context, query });

    return StudentExamsPresenter.presentList(result);
  }
}

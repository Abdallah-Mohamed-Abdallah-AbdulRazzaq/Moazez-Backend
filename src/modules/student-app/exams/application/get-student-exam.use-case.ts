import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentExamDetailResponseDto } from '../dto/student-exams.dto';
import { StudentExamsReadAdapter } from '../infrastructure/student-exams-read.adapter';
import { StudentExamsPresenter } from '../presenters/student-exams.presenter';

@Injectable()
export class GetStudentExamUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentExamsReadAdapter,
  ) {}

  async execute(assessmentId: string): Promise<StudentExamDetailResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.findExam({ context, assessmentId });

    if (!result) {
      throw new NotFoundDomainException('Student App exam not found', {
        assessmentId,
      });
    }

    return StudentExamsPresenter.presentDetail(result);
  }
}

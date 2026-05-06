import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentExamSubmissionStateResponseDto } from '../dto/student-exams.dto';
import { StudentExamsReadAdapter } from '../infrastructure/student-exams-read.adapter';
import { StudentExamsPresenter } from '../presenters/student-exams.presenter';

@Injectable()
export class GetStudentExamSubmissionUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentExamsReadAdapter,
  ) {}

  async execute(
    assessmentId: string,
  ): Promise<StudentExamSubmissionStateResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.findExamSubmission({
      context,
      assessmentId,
    });

    if (!result) {
      throw new NotFoundDomainException('Student App exam not found', {
        assessmentId,
      });
    }

    return StudentExamsPresenter.presentSubmissionState(result);
  }
}

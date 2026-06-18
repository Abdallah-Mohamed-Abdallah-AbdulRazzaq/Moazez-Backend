import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentExamSubmissionStateResponseDto } from '../dto/student-exams.dto';
import { StudentExamsReadAdapter } from '../infrastructure/student-exams-read.adapter';
import { StudentExamsSubmissionWriteAdapter } from '../infrastructure/student-exams-submission-write.adapter';
import {
  presentCurrentStudentExamSubmissionState,
  recordStudentExamSubmissionAudit,
} from './student-exam-submission-use-case.helpers';

@Injectable()
export class SubmitStudentExamSubmissionUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly writeAdapter: StudentExamsSubmissionWriteAdapter,
    private readonly readAdapter: StudentExamsReadAdapter,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    assessmentId: string,
  ): Promise<StudentExamSubmissionStateResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.writeAdapter.submitSubmission({
      context,
      assessmentId,
    });

    await recordStudentExamSubmissionAudit({
      authRepository: this.authRepository,
      context,
      action: 'grades.submission.submit',
      submission: result.submission,
      beforeStatus: result.beforeStatus,
    });

    return presentCurrentStudentExamSubmissionState({
      readAdapter: this.readAdapter,
      context,
      assessmentId,
    });
  }
}

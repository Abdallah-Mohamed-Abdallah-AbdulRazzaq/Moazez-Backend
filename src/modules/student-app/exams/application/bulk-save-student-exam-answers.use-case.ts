import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentExamBulkSaveAnswersDto,
  StudentExamSubmissionStateResponseDto,
} from '../dto/student-exams.dto';
import { StudentExamsReadAdapter } from '../infrastructure/student-exams-read.adapter';
import { StudentExamsSubmissionWriteAdapter } from '../infrastructure/student-exams-submission-write.adapter';
import {
  presentCurrentStudentExamSubmissionState,
  recordStudentExamSubmissionAudit,
} from './student-exam-submission-use-case.helpers';

@Injectable()
export class BulkSaveStudentExamAnswersUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly writeAdapter: StudentExamsSubmissionWriteAdapter,
    private readonly readAdapter: StudentExamsReadAdapter,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    assessmentId: string,
    command: StudentExamBulkSaveAnswersDto,
  ): Promise<StudentExamSubmissionStateResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.writeAdapter.bulkSaveAnswers({
      context,
      assessmentId,
      command,
    });

    await recordStudentExamSubmissionAudit({
      authRepository: this.authRepository,
      context,
      action: 'grades.submission.answers.bulk_save',
      submission: result.submission,
      after: {
        savedCount: result.answers.length,
        questionIds: result.answers.map((answer) => answer.questionId),
      },
    });

    return presentCurrentStudentExamSubmissionState({
      readAdapter: this.readAdapter,
      context,
      assessmentId,
    });
  }
}

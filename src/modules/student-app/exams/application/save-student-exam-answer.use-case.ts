import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentExamSaveAnswerDto,
  StudentExamSubmissionStateResponseDto,
} from '../dto/student-exams.dto';
import { StudentExamsReadAdapter } from '../infrastructure/student-exams-read.adapter';
import { StudentExamsSubmissionWriteAdapter } from '../infrastructure/student-exams-submission-write.adapter';
import {
  presentCurrentStudentExamSubmissionState,
  recordStudentExamAnswerAudit,
} from './student-exam-submission-use-case.helpers';

@Injectable()
export class SaveStudentExamAnswerUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly writeAdapter: StudentExamsSubmissionWriteAdapter,
    private readonly readAdapter: StudentExamsReadAdapter,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(params: {
    assessmentId: string;
    questionId: string;
    command: StudentExamSaveAnswerDto;
  }): Promise<StudentExamSubmissionStateResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.writeAdapter.saveAnswer({
      context,
      assessmentId: params.assessmentId,
      questionId: params.questionId,
      command: params.command,
    });

    await recordStudentExamAnswerAudit({
      authRepository: this.authRepository,
      context,
      action: 'grades.submission.answer.save',
      answer: result.answer,
    });

    return presentCurrentStudentExamSubmissionState({
      readAdapter: this.readAdapter,
      context,
      assessmentId: params.assessmentId,
    });
  }
}

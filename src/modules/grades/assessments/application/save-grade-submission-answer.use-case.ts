import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import {
  assertSubmissionAssessmentAcceptsDrafts,
  assertSubmissionMutable,
} from '../domain/grade-submission-domain';
import { SaveGradeSubmissionAnswerDto } from '../dto/grade-submission.dto';
import { GradesSubmissionsRepository } from '../infrastructure/grades-submissions.repository';
import { presentGradeSubmissionAnswer } from '../presenters/grade-submission.presenter';
import {
  buildSingleAnswerAuditEntry,
  findSubmissionDetailOrThrow,
  prepareSingleAnswerSaveInput,
  resolveQuestionForAnswerOrThrow,
} from './grade-submission-use-case.helpers';

@Injectable()
export class SaveGradeSubmissionAnswerUseCase {
  constructor(
    private readonly gradesSubmissionsRepository: GradesSubmissionsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    submissionId: string,
    questionId: string,
    command: SaveGradeSubmissionAnswerDto,
  ) {
    const scope = requireGradesScope();
    const submission = await findSubmissionDetailOrThrow(
      this.gradesSubmissionsRepository,
      submissionId,
    );
    assertSubmissionMutable(submission);
    assertSubmissionAssessmentAcceptsDrafts(
      submission.assessment,
      submission.assessment.term,
    );

    const question = await resolveQuestionForAnswerOrThrow({
      repository: this.gradesSubmissionsRepository,
      submission,
      questionId,
    });
    const input = await prepareSingleAnswerSaveInput({
      repository: this.gradesSubmissionsRepository,
      submission,
      question,
      command,
    });
    const answer =
      await this.gradesSubmissionsRepository.upsertAnswerWithSelectedOptions(
        input,
      );

    await this.authRepository.createAuditLog(
      buildSingleAnswerAuditEntry({ scope, answer }),
    );

    return presentGradeSubmissionAnswer(answer);
  }
}

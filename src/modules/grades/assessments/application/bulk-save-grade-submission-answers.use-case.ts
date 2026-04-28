import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import {
  assertSubmissionAssessmentAcceptsDrafts,
  assertSubmissionMutable,
} from '../domain/grade-submission-domain';
import { BulkSaveGradeSubmissionAnswersDto } from '../dto/grade-submission.dto';
import { GradesSubmissionsRepository } from '../infrastructure/grades-submissions.repository';
import { presentBulkSaveGradeSubmissionAnswers } from '../presenters/grade-submission.presenter';
import {
  buildBulkAnswerAuditEntry,
  findSubmissionDetailOrThrow,
  prepareBulkAnswerSaveInputs,
} from './grade-submission-use-case.helpers';

@Injectable()
export class BulkSaveGradeSubmissionAnswersUseCase {
  constructor(
    private readonly gradesSubmissionsRepository: GradesSubmissionsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    submissionId: string,
    command: BulkSaveGradeSubmissionAnswersDto,
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

    const inputs = await prepareBulkAnswerSaveInputs({
      repository: this.gradesSubmissionsRepository,
      submission,
      commands: command.answers,
    });
    const answers =
      await this.gradesSubmissionsRepository.bulkUpsertAnswersWithSelectedOptions(
        inputs,
      );

    await this.authRepository.createAuditLog(
      buildBulkAnswerAuditEntry({ scope, submission, answers }),
    );

    return presentBulkSaveGradeSubmissionAnswers({
      submissionId: submission.id,
      answers,
    });
  }
}

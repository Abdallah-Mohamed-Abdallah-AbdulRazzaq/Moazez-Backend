import { Injectable } from '@nestjs/common';
import { requireGradesScope } from '../../grades-context';
import { GradesSubmissionsRepository } from '../infrastructure/grades-submissions.repository';
import { presentGradeSubmissionDetail } from '../presenters/grade-submission.presenter';
import {
  assertSubmissionQuestionBasedForRead,
  findSubmissionDetailOrThrow,
  listQuestionsForSubmissionOrThrow,
} from './grade-submission-use-case.helpers';

@Injectable()
export class GetGradeSubmissionUseCase {
  constructor(
    private readonly gradesSubmissionsRepository: GradesSubmissionsRepository,
  ) {}

  async execute(submissionId: string) {
    requireGradesScope();
    const submission = await findSubmissionDetailOrThrow(
      this.gradesSubmissionsRepository,
      submissionId,
    );
    assertSubmissionQuestionBasedForRead(submission);

    const questions = await listQuestionsForSubmissionOrThrow(
      this.gradesSubmissionsRepository,
      submission.assessmentId,
    );

    return presentGradeSubmissionDetail({ submission, questions });
  }
}

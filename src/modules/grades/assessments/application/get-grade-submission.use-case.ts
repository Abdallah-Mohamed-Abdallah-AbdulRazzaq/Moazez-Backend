import { Injectable, Optional } from '@nestjs/common';
import { GradeReviewReleaseRepository } from '../infrastructure/grade-review-release.repository';
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
    @Optional() private readonly reviewRelease?: GradeReviewReleaseRepository,
  ) {}

  async execute(submissionId: string) {
    const scope = requireGradesScope();
    const submission = await findSubmissionDetailOrThrow(
      this.gradesSubmissionsRepository,
      submissionId,
    );
    assertSubmissionQuestionBasedForRead(submission);

    const questions = await listQuestionsForSubmissionOrThrow(
      this.gradesSubmissionsRepository,
      submission.assessmentId,
    );

    if (scope.userType === 'STUDENT')
      await this.reviewRelease?.markLegacyStudentDisclosure(
        submission,
        submission.assessmentId,
      );
    return presentGradeSubmissionDetail({ submission, questions });
  }
}

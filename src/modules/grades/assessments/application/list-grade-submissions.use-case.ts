import { Injectable } from '@nestjs/common';
import { requireGradesScope } from '../../grades-context';
import { ListGradeSubmissionsQueryDto } from '../dto/grade-submission.dto';
import { GradesSubmissionsRepository } from '../infrastructure/grades-submissions.repository';
import { presentGradeSubmissionsList } from '../presenters/grade-submission.presenter';
import {
  assertAssessmentQuestionBasedForRead,
  findSubmissionAssessmentOrThrow,
  listQuestionsForSubmissionOrThrow,
} from './grade-submission-use-case.helpers';

@Injectable()
export class ListGradeSubmissionsUseCase {
  constructor(
    private readonly gradesSubmissionsRepository: GradesSubmissionsRepository,
  ) {}

  async execute(assessmentId: string, query: ListGradeSubmissionsQueryDto) {
    requireGradesScope();
    const assessment = await findSubmissionAssessmentOrThrow(
      this.gradesSubmissionsRepository,
      assessmentId,
    );
    assertAssessmentQuestionBasedForRead(assessment);

    const [questions, submissions] = await Promise.all([
      listQuestionsForSubmissionOrThrow(
        this.gradesSubmissionsRepository,
        assessment.id,
      ),
      this.gradesSubmissionsRepository.listSubmissions({
        assessmentId: assessment.id,
        filters: query,
      }),
    ]);

    return presentGradeSubmissionsList({ submissions, questions });
  }
}

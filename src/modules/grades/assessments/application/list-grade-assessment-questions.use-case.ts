import { Injectable } from '@nestjs/common';
import { requireGradesScope } from '../../grades-context';
import { ListGradeAssessmentQuestionsQueryDto } from '../dto/grade-assessment-question.dto';
import { GradesAssessmentQuestionsRepository } from '../infrastructure/grades-assessment-questions.repository';
import { presentGradeAssessmentQuestions } from '../presenters/grade-assessment-question.presenter';
import { loadQuestionAssessmentOrThrow } from './grade-assessment-question-use-case.helpers';

@Injectable()
export class ListGradeAssessmentQuestionsUseCase {
  constructor(
    private readonly questionsRepository: GradesAssessmentQuestionsRepository,
  ) {}

  async execute(
    assessmentId: string,
    _query: ListGradeAssessmentQuestionsQueryDto,
  ) {
    requireGradesScope();
    const assessment = await loadQuestionAssessmentOrThrow(
      this.questionsRepository,
      assessmentId,
    );
    const questions = await this.questionsRepository.listQuestions(
      assessment.id,
    );

    return presentGradeAssessmentQuestions({ assessment, questions });
  }
}

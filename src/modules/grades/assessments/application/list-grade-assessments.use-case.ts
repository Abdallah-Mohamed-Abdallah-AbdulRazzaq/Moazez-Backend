import { Injectable } from '@nestjs/common';
import { requireGradesScope } from '../../grades-context';
import { ListGradeAssessmentsQueryDto } from '../dto/grade-assessment.dto';
import { GradesAssessmentsRepository } from '../infrastructure/grades-assessments.repository';
import { presentGradeAssessments } from '../presenters/grade-assessment.presenter';
import { normalizeAssessmentListFilters } from './grade-assessment-use-case.helpers';

@Injectable()
export class ListGradeAssessmentsUseCase {
  constructor(
    private readonly gradesAssessmentsRepository: GradesAssessmentsRepository,
  ) {}

  async execute(query: ListGradeAssessmentsQueryDto) {
    const scope = requireGradesScope();
    const assessments =
      await this.gradesAssessmentsRepository.listAssessments(
        normalizeAssessmentListFilters(query, scope.schoolId),
      );

    return presentGradeAssessments(assessments);
  }
}

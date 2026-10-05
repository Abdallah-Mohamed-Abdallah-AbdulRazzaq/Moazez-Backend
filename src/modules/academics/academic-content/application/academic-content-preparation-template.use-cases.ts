import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  normalizePreparationTemplate,
  normalizeTemplateSearch,
  type PreparationTemplateInput,
} from '../domain/academic-content-preparation-template.policy';
import { optionalId } from '../domain/academic-content-type-detail.policy';
import {
  AcademicContentPreparationTemplateRepository,
  type PreparationTemplateApplicability,
} from '../infrastructure/academic-content-preparation-template.repository';
import { academicContentManagementScope } from './academic-content-management.scope';

const ownedFields = new Set([
  'name',
  'description',
  'stageId',
  'subjectId',
  'topic',
  'objectives',
  'learningOutcomes',
  'teachingStrategies',
  'activities',
  'resourceNotes',
  'assessmentNotes',
  'teacherNotes',
]);

export type PreparationTemplateReadQuery = {
  search?: string;
  page?: number;
  limit?: number;
};

function normalizeReadQuery(query: PreparationTemplateReadQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (page - 1) * limit > 2_147_483_647
  )
    throw new ValidationDomainException('Invalid template pagination');
  return { page, limit, search: normalizeTemplateSearch(query.search) };
}

@Injectable()
export class AcademicContentPreparationTemplateUseCases {
  constructor(
    private readonly repository: AcademicContentPreparationTemplateRepository,
  ) {}

  list(query: {
    stageId?: string;
    subjectId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { schoolId } = academicContentManagementScope(
      'academics.academic_content.view',
    );
    return this.repository.list(schoolId, {
      ...normalizeReadQuery(query),
      stageId: query.stageId
        ? (optionalId(query.stageId, 'stageId') ?? undefined)
        : undefined,
      subjectId: query.subjectId
        ? (optionalId(query.subjectId, 'subjectId') ?? undefined)
        : undefined,
    });
  }

  /** Trusted Core read boundary; Teacher App resolves allocation applicability. */
  listApplicable(
    scope: PreparationTemplateApplicability,
    query: PreparationTemplateReadQuery,
  ) {
    return this.repository.listApplicable(scope, normalizeReadQuery(query));
  }

  detailApplicable(scope: PreparationTemplateApplicability, id: string) {
    return this.repository.detailApplicable(scope, id);
  }

  detail(id: string) {
    const { schoolId } = academicContentManagementScope(
      'academics.academic_content.view',
    );
    return this.repository.detail(schoolId, id);
  }

  create(input: PreparationTemplateInput) {
    const scope = academicContentManagementScope(
      'academics.academic_content.settings.manage',
    );
    return this.repository.create(scope, normalizePreparationTemplate(input));
  }

  update(id: string, input: PreparationTemplateInput) {
    const scope = academicContentManagementScope(
      'academics.academic_content.settings.manage',
    );
    if (
      !input ||
      typeof input !== 'object' ||
      Object.keys(input).length === 0 ||
      Object.keys(input).some((key) => !ownedFields.has(key))
    )
      throw new ValidationDomainException('Invalid preparation template patch');
    return this.repository.update(scope, id, input);
  }

  delete(id: string) {
    const scope = academicContentManagementScope(
      'academics.academic_content.settings.manage',
    );
    return this.repository.delete(scope, id);
  }
}

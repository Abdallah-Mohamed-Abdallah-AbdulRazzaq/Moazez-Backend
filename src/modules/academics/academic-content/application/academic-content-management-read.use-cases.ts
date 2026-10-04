import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AcademicContentRepository } from '../infrastructure/academic-content.repository';
import type { AcademicContentLibraryQuery } from '../domain/academic-content-library.query';
import { normalizeAcademicContentLibraryQuery } from '../domain/academic-content-library-normalization.policy';
import { academicContentManagementScope } from './academic-content-management.scope';

@Injectable()
export class ListAcademicContentForManagementUseCase {
  constructor(private readonly contents: AcademicContentRepository) {}

  execute(query: AcademicContentLibraryQuery) {
    const { schoolId } = academicContentManagementScope(
      'academics.academic_content.view',
    );
    const normalized = normalizeAcademicContentLibraryQuery(query);
    return this.contents.listForManagement(
      schoolId,
      normalized.page,
      normalized.limit,
      normalized,
    );
  }
}

@Injectable()
export class GetAcademicContentForManagementUseCase {
  constructor(private readonly contents: AcademicContentRepository) {}

  async execute(contentId: string) {
    const { schoolId } = academicContentManagementScope(
      'academics.academic_content.view',
    );
    const detail = await this.contents.findManagementDetail(
      contentId,
      schoolId,
    );
    if (!detail)
      throw new NotFoundDomainException('Academic content not found');
    return detail;
  }
}

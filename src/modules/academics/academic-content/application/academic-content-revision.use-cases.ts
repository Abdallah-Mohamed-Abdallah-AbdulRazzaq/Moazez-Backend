import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { academicContentManagementScope } from './academic-content-management.scope';
import { AcademicContentRevisionRepository } from '../infrastructure/academic-content-revision.repository';

export type TrustedAcademicContentRevisionScope = {
  schoolId: string;
  organizationId: string;
  actorId: string;
  contentId: string;
};

@Injectable()
export class CaptureAcademicContentRevisionUseCase {
  constructor(private readonly revisions: AcademicContentRevisionRepository) {}

  execute(scope: TrustedAcademicContentRevisionScope, now = new Date()) {
    return this.revisions.capture({ ...scope, now });
  }
}

@Injectable()
export class ListAcademicContentRevisionsUseCase {
  constructor(private readonly revisions: AcademicContentRevisionRepository) {}

  execute(contentId: string, query: { page?: number; limit?: number }) {
    const { schoolId } = academicContentManagementScope(
      'academics.academic_content.view',
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (page - 1) * limit > Number.MAX_SAFE_INTEGER - limit
    )
      throw new ValidationDomainException('Invalid revision pagination');
    return this.revisions.list({ schoolId, contentId, page, limit });
  }
}

@Injectable()
export class GetAcademicContentRevisionUseCase {
  constructor(private readonly revisions: AcademicContentRevisionRepository) {}

  execute(contentId: string, revisionId: string) {
    const { schoolId } = academicContentManagementScope(
      'academics.academic_content.view',
    );
    return this.revisions.detail({ schoolId, contentId, revisionId });
  }
}

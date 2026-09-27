import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import type {
  AcademicContentReviewPage,
  AcademicContentReviewQueueQuery,
} from '../domain/academic-content-review.query';
import { AcademicContentReviewRepository } from '../infrastructure/academic-content-review.repository';
import { academicContentManagementScope } from './academic-content-management.scope';

function boundedPage(query: AcademicContentReviewPage): {
  page: number;
  limit: number;
} {
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
    throw new ValidationDomainException('Invalid review pagination');
  return { page, limit };
}

@Injectable()
export class ListAcademicContentReviewQueueUseCase {
  constructor(private readonly reviews: AcademicContentReviewRepository) {}

  execute(query: AcademicContentReviewQueueQuery) {
    const { schoolId } = academicContentManagementScope(
      'academics.academic_content.approve',
    );
    const page = boundedPage(query);
    const search = query.search?.normalize('NFKC').trim();
    if (search && search.length > 120)
      throw new ValidationDomainException('Review search is too long');
    return this.reviews.queue(schoolId, { ...query, ...page, search });
  }
}

@Injectable()
export class ListAcademicContentApprovalHistoryUseCase {
  constructor(private readonly reviews: AcademicContentReviewRepository) {}

  execute(contentId: string, query: AcademicContentReviewPage) {
    const { schoolId } = academicContentManagementScope(
      'academics.academic_content.view',
    );
    return this.reviews.history({ schoolId, contentId, ...boundedPage(query) });
  }
}

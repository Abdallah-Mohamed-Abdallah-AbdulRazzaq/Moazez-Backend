import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AcademicContentRepository } from '../infrastructure/academic-content.repository';
import type { AcademicContentLibraryQuery } from '../domain/academic-content-library.query';
import {
  dateOnly,
  instant,
} from '../domain/academic-content-type-detail.policy';
import { isISO8601 } from 'class-validator';
import { academicContentManagementScope } from './academic-content-management.scope';

@Injectable()
export class ListAcademicContentForManagementUseCase {
  constructor(private readonly contents: AcademicContentRepository) {}

  execute(query: AcademicContentLibraryQuery) {
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
    ) {
      throw new ValidationDomainException('Invalid management pagination');
    }
    const weeklyDateFrom = query.weeklyDateFrom
      ? dateOnly(query.weeklyDateFrom, 'weeklyDateFrom')
      : undefined;
    const weeklyDateTo = query.weeklyDateTo
      ? dateOnly(query.weeklyDateTo, 'weeklyDateTo')
      : undefined;
    if (weeklyDateFrom && weeklyDateTo && weeklyDateFrom > weeklyDateTo)
      throw new ValidationDomainException('Invalid weekly date range');
    for (const value of [query.sessionStartAtFrom, query.sessionStartAtTo]) {
      if (value && !isISO8601(value, { strict: true, strictSeparator: true }))
        throw new ValidationDomainException('Invalid session start range');
    }
    const sessionStartAtFrom = query.sessionStartAtFrom
      ? instant(query.sessionStartAtFrom, 'sessionStartAtFrom')
      : undefined;
    const sessionStartAtTo = query.sessionStartAtTo
      ? instant(query.sessionStartAtTo, 'sessionStartAtTo')
      : undefined;
    if (
      sessionStartAtFrom &&
      sessionStartAtTo &&
      sessionStartAtFrom > sessionStartAtTo
    )
      throw new ValidationDomainException('Invalid session start range');
    return this.contents.listForManagement(schoolId, page, limit, {
      ...query,
      weeklyDateFrom,
      weeklyDateTo,
      sessionStartAtFrom,
      sessionStartAtTo,
    });
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

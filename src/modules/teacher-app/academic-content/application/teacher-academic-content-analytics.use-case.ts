import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { ScopeMissingException } from '../../../iam/auth/domain/auth.exceptions';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { AcademicContentTeacherAnalyticsRepository } from '../../../academics/academic-content/infrastructure/academic-content-teacher-analytics.repository';
import {
  ACADEMIC_CONTENT_OWN_ANALYTICS_PERMISSIONS,
  ACADEMIC_CONTENT_ANALYTICS_MEASUREMENTS,
  academicContentAnalyticsRangeDays,
} from '../../../academics/academic-content/domain/academic-content-analytics.contract';
import { assertAcademicContentPublicationUuid } from '../../../academics/academic-content/domain/academic-content-publication.policy';
import type {
  TeacherAcademicContentAnalyticsQueryDto,
  TeacherAcademicContentAnalyticsResponseDto,
} from '../dto/teacher-academic-content-analytics.dto';

@Injectable()
export class TeacherAcademicContentAnalyticsUseCase {
  constructor(
    private readonly access: TeacherAppAccessService,
    private readonly analytics: AcademicContentTeacherAnalyticsRepository,
  ) {}

  async execute(
    contentId: string,
    query: TeacherAcademicContentAnalyticsQueryDto,
    publicationId?: string,
  ): Promise<TeacherAcademicContentAnalyticsResponseDto> {
    const teacher = this.access.assertCurrentTeacher();
    const missing = ACADEMIC_CONTENT_OWN_ANALYTICS_PERMISSIONS.filter(
      (permission) => !teacher.permissions.includes(permission),
    );
    if (missing.length)
      throw new ScopeMissingException({ missingPermissions: missing });
    if (!query || Object.keys(query).some((key) => key !== 'range'))
      throw new ValidationDomainException(
        'Only analytics range may be supplied',
      );
    academicContentAnalyticsRangeDays(query.range);
    assertAcademicContentPublicationUuid(contentId);
    if (publicationId !== undefined)
      assertAcademicContentPublicationUuid(publicationId);
    const row = await this.analytics.read(
      teacher,
      contentId,
      query.range ?? '30d',
      publicationId,
    );
    return {
      contentId,
      publicationId: publicationId ?? null,
      revisionId: row.revisionId,
      includedPublicationCount: row.includedPublicationCount,
      window: {
        range: query.range ?? '30d',
        from: row.from.toISOString(),
        toExclusive: row.toExclusive.toISOString(),
        timezone: 'UTC',
      },
      metrics: {
        totalEventReports: row.totalEventReports,
        eventCountsByTypeAndActorKind: row.eventCountsByTypeAndActorKind,
        distinctStudentActorsEngaged: row.distinctStudentActorsEngaged,
        distinctParentChildPairsEngaged: row.distinctParentChildPairsEngaged,
        acknowledgementRecords: row.acknowledgementRecords,
        distinctAcknowledgingParentChildPairs:
          row.distinctAcknowledgingParentChildPairs,
      },
      measurements: ACADEMIC_CONTENT_ANALYTICS_MEASUREMENTS,
    };
  }
}

import { Injectable } from '@nestjs/common';
import {
  AcademicContentPublicationCommand,
  assertAcademicContentPublicationCommand,
  assertAcademicContentPublicationUuid,
} from '../domain/academic-content-publication.policy';
import {
  AcademicContentPublicationRepository,
  academicContentPublicationPagination,
} from '../infrastructure/academic-content-publication.repository';
import { AcademicContentAudienceResolver } from './academic-content-audience.resolver';
import { academicContentManagementScope } from './academic-content-management.scope';

@Injectable()
export class ScheduleAcademicContentPublicationUseCase {
  constructor(
    private readonly publications: AcademicContentPublicationRepository,
  ) {}
  execute(contentId: string, command: AcademicContentPublicationCommand) {
    const scope = academicContentManagementScope(
      'academics.academic_content.publish',
    );
    assertAcademicContentPublicationCommand(contentId, command);
    return this.publications.schedule({ ...scope, contentId, command });
  }
}

@Injectable()
export class UnscheduleAcademicContentPublicationUseCase {
  constructor(
    private readonly publications: AcademicContentPublicationRepository,
  ) {}
  execute(contentId: string, publicationId: string) {
    const scope = academicContentManagementScope(
      'academics.academic_content.publish',
    );
    assertAcademicContentPublicationUuid(contentId);
    assertAcademicContentPublicationUuid(publicationId);
    return this.publications.unschedule({ ...scope, contentId, publicationId });
  }
}

@Injectable()
export class GetAcademicContentPublicationReadinessUseCase {
  constructor(
    private readonly publications: AcademicContentPublicationRepository,
  ) {}
  execute(contentId: string) {
    const scope = academicContentManagementScope(
      'academics.academic_content.view',
    );
    assertAcademicContentPublicationUuid(contentId);
    return this.publications.readiness({ schoolId: scope.schoolId, contentId });
  }
}

@Injectable()
export class ListAcademicContentPublicationHistoryUseCase {
  constructor(
    private readonly publications: AcademicContentPublicationRepository,
  ) {}
  execute(contentId: string, input: { page?: number; limit?: number } = {}) {
    const scope = academicContentManagementScope(
      'academics.academic_content.view',
    );
    assertAcademicContentPublicationUuid(contentId);
    const page = input.page ?? 1;
    const limit = input.limit ?? 20;
    academicContentPublicationPagination(page, limit);
    return this.publications.history({
      schoolId: scope.schoolId,
      contentId,
      page,
      limit,
    });
  }
}

@Injectable()
export class GetAcademicContentPublicationUseCase {
  constructor(
    private readonly publications: AcademicContentPublicationRepository,
  ) {}
  execute(contentId: string, publicationId: string) {
    const scope = academicContentManagementScope(
      'academics.academic_content.view',
    );
    assertAcademicContentPublicationUuid(contentId);
    assertAcademicContentPublicationUuid(publicationId);
    return this.publications.detail({
      schoolId: scope.schoolId,
      contentId,
      publicationId,
    });
  }
}

@Injectable()
export class GetAcademicContentAudiencePreviewUseCase {
  constructor(private readonly audience: AcademicContentAudienceResolver) {}
  async execute(contentId: string) {
    const scope = academicContentManagementScope(
      'academics.academic_content.view',
    );
    assertAcademicContentPublicationUuid(contentId);
    const asOf = new Date();
    const resolved = await this.audience.resolve(contentId, scope.schoolId);
    return {
      asOf,
      students: resolved.students.length,
      guardianContexts: resolved.guardians.length,
      guardianUsersWithAccounts: new Set(
        resolved.guardians.flatMap((row) =>
          row.recipientUserId === null ? [] : [row.recipientUserId],
        ),
      ).size,
      guardianNotificationOptOutContexts: resolved.guardians.filter(
        (row) => row.canReceiveNotifications === false,
      ).length,
    };
  }
}

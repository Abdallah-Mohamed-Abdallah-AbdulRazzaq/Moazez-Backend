import { Injectable, Logger } from '@nestjs/common';
import { AcademicContentPublicationStatus } from '@prisma/client';
import { AcademicContentPublicationQueueService } from './academic-content-publication-queue.service';
import { AcademicContentPublicationLifecycleRepository } from '../infrastructure/academic-content-publication-lifecycle.repository';
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
import { CommunicationNotificationQueueService } from '../../../communication/application/communication-notification-queue.service';

@Injectable()
export class ScheduleAcademicContentPublicationUseCase {
  private readonly logger = new Logger(
    ScheduleAcademicContentPublicationUseCase.name,
  );
  constructor(
    private readonly publications: AcademicContentPublicationRepository,
    private readonly queue: AcademicContentPublicationQueueService,
  ) {}
  execute(contentId: string, command: AcademicContentPublicationCommand) {
    const scope = academicContentManagementScope(
      'academics.academic_content.publish',
    );
    assertAcademicContentPublicationCommand(contentId, command);
    return this.schedule(scope, contentId, command);
  }
  private async schedule(
    scope: ReturnType<typeof academicContentManagementScope>,
    contentId: string,
    command: AcademicContentPublicationCommand,
  ) {
    const result = await this.publications.schedule({
      ...scope,
      contentId,
      command,
    });
    if (result.status === AcademicContentPublicationStatus.SCHEDULED) {
      await this.queue.ensureAfterCommit('publish', {
        schoolId: scope.schoolId,
        contentId,
        publicationId: result.publicationId,
      });
      this.logger.log({
        event: 'academic_content.publication.scheduled',
        schoolId: scope.schoolId,
        contentId,
        publicationId: result.publicationId,
      });
    }
    return result;
  }
}

/** Internal composition boundary; the management HTTP route is deferred to ACC-8E. */
@Injectable()
export class StartAcademicContentRevisionUseCase {
  constructor(
    private readonly repository: AcademicContentPublicationLifecycleRepository,
  ) {}
  execute(contentId: string, publicationId: string) {
    const scope = academicContentManagementScope(
      'academics.academic_content.manage',
    );
    academicContentManagementScope('academics.academic_content.publish');
    assertAcademicContentPublicationUuid(contentId);
    assertAcademicContentPublicationUuid(publicationId);
    return this.repository.startRevision({
      ...scope,
      contentId,
      publicationId,
      now: new Date(),
    });
  }
}

@Injectable()
export class CancelAcademicContentPublicationUseCase {
  private readonly logger = new Logger(
    CancelAcademicContentPublicationUseCase.name,
  );
  constructor(
    private readonly publications: AcademicContentPublicationLifecycleRepository,
    private readonly notifications: CommunicationNotificationQueueService,
  ) {}
  execute(contentId: string, publicationId: string) {
    const scope = academicContentManagementScope(
      'academics.academic_content.publish',
    );
    assertAcademicContentPublicationUuid(contentId);
    assertAcademicContentPublicationUuid(publicationId);
    return this.cancel(scope, contentId, publicationId);
  }
  private async cancel(
    scope: ReturnType<typeof academicContentManagementScope>,
    contentId: string,
    publicationId: string,
  ) {
    const result = await this.publications.cancel({
      ...scope,
      contentId,
      publicationId,
      now: new Date(),
    });
    try {
      await this.notifications.ensureAcademicContentCancellationNotifications({
        schoolId: scope.schoolId,
        organizationId: scope.organizationId,
        contentId,
        publicationId,
        actorUserId: null,
        actorUserType: null,
      });
      this.logger.log({
        event: 'academic_content.cancellation_notification.enqueued',
        schoolId: scope.schoolId,
        contentId,
        publicationId,
      });
    } catch {
      this.logger.warn({
        event: 'academic_content.cancellation_notification.skipped',
        schoolId: scope.schoolId,
        contentId,
        publicationId,
        reason: 'post_commit_enqueue_failed',
      });
    }
    this.logger.log({
      event: 'academic_content.publication.cancelled',
      schoolId: scope.schoolId,
      contentId,
      publicationId,
    });
    return result;
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

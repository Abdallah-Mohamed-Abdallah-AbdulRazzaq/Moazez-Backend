import type { AcademicContentTeacherWriteScope } from '../infrastructure/academic-content-teacher-write.authorization';
import { Injectable } from '@nestjs/common';
import { AcademicContentReviewDecisionNotificationEnqueueService } from './academic-content-review-decision-notification-enqueue.service';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { AcademicContentWorkflowRepository } from '../infrastructure/academic-content-workflow.repository';
import { academicContentManagementScope } from './academic-content-management.scope';

function requireEmptyBody(body: unknown): void {
  if (body == null) return;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length
  )
    throw new ValidationDomainException(
      'Unexpected Academic Content workflow fields',
    );
}

@Injectable()
export class SubmitAcademicContentUseCase {
  constructor(private readonly workflow: AcademicContentWorkflowRepository) {}

  execute(contentId: string, body: unknown = {}) {
    const scope = academicContentManagementScope(
      'academics.academic_content.manage',
    );
    return this.executeScoped(scope, contentId, body);
  }

  /** Trusted entry point: Teacher App has checked actor and manage permission. */
  executeForTeacher(
    scope: AcademicContentTeacherWriteScope,
    contentId: string,
    body: unknown = {},
  ) {
    return this.executeScoped(scope, contentId, body);
  }

  private executeScoped(
    scope:
      | ReturnType<typeof academicContentManagementScope>
      | AcademicContentTeacherWriteScope,
    contentId: string,
    body: unknown,
  ) {
    requireEmptyBody(body);
    return this.workflow.submit({ ...scope, contentId });
  }
}

@Injectable()
export class ApproveAcademicContentUseCase {
  constructor(
    private readonly workflow: AcademicContentWorkflowRepository,
    private readonly notifications: AcademicContentReviewDecisionNotificationEnqueueService,
  ) {}

  execute(contentId: string, body: unknown = {}) {
    const scope = academicContentManagementScope(
      'academics.academic_content.approve',
    );
    requireEmptyBody(body);
    return this.workflow
      .decide({
        ...scope,
        contentId,
        decision: 'approve',
        note: null,
      })
      .then(async (result) => {
        await this.notifications.ensureAfterDecisionCommit({
          schoolId: scope.schoolId,
          organizationId: scope.organizationId,
          approvalId: result.approvalId,
          actorUserId: null,
          actorUserType: null,
        });
        return result;
      });
  }
}

@Injectable()
export class RequestAcademicContentChangesUseCase {
  constructor(
    private readonly workflow: AcademicContentWorkflowRepository,
    private readonly notifications: AcademicContentReviewDecisionNotificationEnqueueService,
  ) {}

  execute(contentId: string, body: unknown) {
    const scope = academicContentManagementScope(
      'academics.academic_content.approve',
    );
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !Object.prototype.hasOwnProperty.call(body, 'note') ||
      typeof (body as { note?: unknown }).note !== 'string'
    )
      throw new ValidationDomainException('A decision note is required');
    const note = (body as { note: string }).note.trim();
    if (!note || note.length > 4000)
      throw new ValidationDomainException(
        'Decision note must contain 1 to 4000 characters',
      );
    return this.workflow
      .decide({
        ...scope,
        contentId,
        decision: 'request-changes',
        note,
      })
      .then(async (result) => {
        await this.notifications.ensureAfterDecisionCommit({
          schoolId: scope.schoolId,
          organizationId: scope.organizationId,
          approvalId: result.approvalId,
          actorUserId: null,
          actorUserType: null,
        });
        return result;
      });
  }
}

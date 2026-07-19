import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import type { SettingsScope } from '../../settings-context';
import { TeacherRoleTransitionConflictException } from '../../../teachers/directory/domain/teacher-directory.errors';
import { TeacherRejectedTransitionAuditService } from '../../../teachers/lifecycle/application/teacher-rejected-transition-audit.service';
import { TeacherLifecycleInvalidTransitionException } from '../../../teachers/lifecycle/domain/teacher-lifecycle.errors';
import type {
  TeacherLifecycleAuditReasonCode,
  TeacherLifecycleAuditResourceType,
} from '../../../teachers/lifecycle/domain/teacher-lifecycle-audit';

type SettingsTeacherBypassReason = Extract<
  TeacherLifecycleAuditReasonCode,
  | 'teacher_directory_provisioning_required'
  | 'teacher_promotion_requires_profile'
  | 'teacher_display_projection_managed'
>;

@Injectable()
export class TeacherSettingsBypassService {
  constructor(
    private readonly rejectedAudit: TeacherRejectedTransitionAuditService,
  ) {}

  reject(input: {
    scope: SettingsScope;
    reasonCode: SettingsTeacherBypassReason;
    resourceType: TeacherLifecycleAuditResourceType;
    resourceId: string;
  }): Promise<never> {
    const error = new TeacherRoleTransitionConflictException(input.reasonCode);
    return this.rejectedAudit.auditAndThrow({
      error,
      audit: {
        actorId: input.scope.actorId,
        actorUserType: input.scope.userType,
        organizationId: input.scope.organizationId,
        schoolId: input.scope.schoolId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: { reasonCode: input.reasonCode },
      },
      traceId: getRequestContext()?.requestId ?? 'unavailable',
    });
  }

  rejectActivation(input: {
    scope: SettingsScope;
    resourceId: string;
    previousStatus: UserStatus;
  }): Promise<never> {
    const reasonCode = 'teacher_activation_requires_lifecycle' as const;
    const error = new TeacherLifecycleInvalidTransitionException(
      input.previousStatus,
      UserStatus.ACTIVE,
      reasonCode,
    );
    return this.rejectedAudit.auditAndThrow({
      error,
      audit: {
        actorId: input.scope.actorId,
        actorUserType: input.scope.userType,
        organizationId: input.scope.organizationId,
        schoolId: input.scope.schoolId,
        resourceType: 'user',
        resourceId: input.resourceId,
        metadata: { reasonCode },
      },
      traceId: getRequestContext()?.requestId ?? 'unavailable',
    });
  }
}

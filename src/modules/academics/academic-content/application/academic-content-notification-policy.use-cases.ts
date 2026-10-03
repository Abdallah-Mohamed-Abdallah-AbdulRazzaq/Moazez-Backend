import { Injectable } from '@nestjs/common';
import {
  AcademicContentNotificationPolicyPatch,
  effectiveAcademicContentNotificationPolicy,
  normalizeAcademicContentNotificationPolicyPatch,
} from '../domain/academic-content-notification.policy';
import { AcademicContentNotificationPolicyRepository } from '../infrastructure/academic-content-notification-policy.repository';
import { academicContentManagementScope } from './academic-content-management.scope';

@Injectable()
export class GetAcademicContentNotificationPolicyUseCase {
  constructor(
    private readonly repository: AcademicContentNotificationPolicyRepository,
  ) {}

  async execute() {
    const { schoolId } = academicContentManagementScope(
      'academics.academic_content.view',
    );
    return effectiveAcademicContentNotificationPolicy(
      await this.repository.findPolicy(schoolId),
    );
  }
}

@Injectable()
export class UpdateAcademicContentNotificationPolicyUseCase {
  constructor(
    private readonly repository: AcademicContentNotificationPolicyRepository,
  ) {}

  execute(command: AcademicContentNotificationPolicyPatch) {
    const scope = academicContentManagementScope(
      'academics.academic_content.settings.manage',
    );
    return this.repository.updatePolicy({
      ...scope,
      patch: normalizeAcademicContentNotificationPolicyPatch(command),
    });
  }
}

import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { effectiveAcademicContentWorkflowPolicy } from '../domain/academic-content-workflow.policy';
import { AcademicContentWorkflowPolicyRepository } from '../infrastructure/academic-content-workflow-policy.repository';
import { academicContentManagementScope } from './academic-content-management.scope';

@Injectable()
export class GetAcademicContentWorkflowPolicyUseCase {
  constructor(
    private readonly repository: AcademicContentWorkflowPolicyRepository,
  ) {}

  async execute() {
    const { schoolId } = academicContentManagementScope(
      'academics.academic_content.view',
    );
    return effectiveAcademicContentWorkflowPolicy(
      await this.repository.findPolicy(schoolId),
    );
  }
}

@Injectable()
export class UpdateAcademicContentWorkflowPolicyUseCase {
  constructor(
    private readonly repository: AcademicContentWorkflowPolicyRepository,
  ) {}

  execute(command: { preparationApprovalRequired?: boolean }) {
    const scope = academicContentManagementScope(
      'academics.academic_content.settings.manage',
    );
    if (
      !command ||
      Object.keys(command).length !== 1 ||
      typeof command.preparationApprovalRequired !== 'boolean'
    )
      throw new ValidationDomainException(
        'Invalid Academic Content workflow policy',
      );
    return this.repository.updatePolicy({
      ...scope,
      preparationApprovalRequired: command.preparationApprovalRequired,
    });
  }
}

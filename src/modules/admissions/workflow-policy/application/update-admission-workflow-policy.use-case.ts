import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireApplicationsScope } from '../../applications/applications-scope';
import {
  AdmissionWorkflowPolicyResponseDto,
  UpdateAdmissionWorkflowPolicyDto,
} from '../dto/admission-workflow-policy.dto';
import { AdmissionWorkflowPolicyRepository } from '../infrastructure/admission-workflow-policy.repository';
import { presentAdmissionWorkflowPolicy } from '../presenters/admission-workflow-policy.presenter';
import {
  DEFAULT_ADMISSION_WORKFLOW_POLICY,
  ResolvedAdmissionWorkflowPolicy,
  resolveAdmissionWorkflowPolicyRecord,
} from './resolve-admission-workflow-policy.service';

type PolicyPatch = Partial<{
  requiresPlacementTest: boolean;
  requiresInterview: boolean;
  allowDirectAcceptance: boolean;
}>;

function extractPolicyPatch(
  command: UpdateAdmissionWorkflowPolicyDto,
): PolicyPatch {
  const patch: PolicyPatch = {};

  if (command.requiresPlacementTest !== undefined) {
    patch.requiresPlacementTest = command.requiresPlacementTest;
  }
  if (command.requiresInterview !== undefined) {
    patch.requiresInterview = command.requiresInterview;
  }
  if (command.allowDirectAcceptance !== undefined) {
    patch.allowDirectAcceptance = command.allowDirectAcceptance;
  }

  return patch;
}

function assertPatchHasFields(patch: PolicyPatch): void {
  if (Object.keys(patch).length === 0) {
    throw new ValidationDomainException(
      'At least one workflow policy field is required',
      {
        field: 'body',
        reason: 'at_least_one_policy_field_required',
      },
    );
  }
}

function auditPolicy(policy: ResolvedAdmissionWorkflowPolicy): Record<string, unknown> {
  return {
    requiresPlacementTest: policy.requiresPlacementTest,
    requiresInterview: policy.requiresInterview,
    allowDirectAcceptance: policy.allowDirectAcceptance,
    source: policy.source,
  };
}

@Injectable()
export class UpdateAdmissionWorkflowPolicyUseCase {
  constructor(
    private readonly admissionWorkflowPolicyRepository: AdmissionWorkflowPolicyRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: UpdateAdmissionWorkflowPolicyDto,
  ): Promise<AdmissionWorkflowPolicyResponseDto> {
    const scope = requireApplicationsScope();
    const patch = extractPolicyPatch(command);
    assertPatchHasFields(patch);

    const existing = await this.admissionWorkflowPolicyRepository.findBySchoolId(
      scope.schoolId,
    );
    const before = resolveAdmissionWorkflowPolicyRecord(existing);
    const record = existing
      ? await this.admissionWorkflowPolicyRepository.updatePolicy({
          id: existing.id,
          schoolId: scope.schoolId,
          data: patch,
        })
      : await this.admissionWorkflowPolicyRepository.createPolicy({
          schoolId: scope.schoolId,
          organizationId: scope.organizationId,
          ...DEFAULT_ADMISSION_WORKFLOW_POLICY,
          ...patch,
        });

    if (!record) {
      throw new NotFoundDomainException('Admission workflow policy not found', {
        reason: 'policy_not_found_after_update',
      });
    }

    const after = resolveAdmissionWorkflowPolicyRecord(record);

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'admissions',
      action: 'admissions.workflow_policy.update',
      resourceType: 'admission_workflow_policy',
      resourceId: record.id,
      outcome: AuditOutcome.SUCCESS,
      before: auditPolicy(before),
      after: auditPolicy(after),
    });

    return presentAdmissionWorkflowPolicy(after);
  }
}

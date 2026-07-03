import { Injectable } from '@nestjs/common';
import { requireApplicationsScope } from '../../applications/applications-scope';
import { AdmissionWorkflowPolicySource } from '../dto/admission-workflow-policy.dto';
import {
  AdmissionWorkflowPolicyRecord,
  AdmissionWorkflowPolicyRepository,
} from '../infrastructure/admission-workflow-policy.repository';

export interface AdmissionWorkflowPolicySettings {
  requiresPlacementTest: boolean;
  requiresInterview: boolean;
  allowDirectAcceptance: boolean;
}

export interface ResolvedAdmissionWorkflowPolicy
  extends AdmissionWorkflowPolicySettings {
  id: string | null;
  source: AdmissionWorkflowPolicySource;
  updatedAt: Date | null;
}

export const DEFAULT_ADMISSION_WORKFLOW_POLICY: AdmissionWorkflowPolicySettings = {
  requiresPlacementTest: true,
  requiresInterview: true,
  allowDirectAcceptance: false,
};

export function resolveAdmissionWorkflowPolicyRecord(
  record: AdmissionWorkflowPolicyRecord | null,
): ResolvedAdmissionWorkflowPolicy {
  if (!record) {
    return {
      ...DEFAULT_ADMISSION_WORKFLOW_POLICY,
      id: null,
      source: 'default',
      updatedAt: null,
    };
  }

  return {
    id: record.id,
    requiresPlacementTest: record.requiresPlacementTest,
    requiresInterview: record.requiresInterview,
    allowDirectAcceptance: record.allowDirectAcceptance,
    source: 'school_override',
    updatedAt: record.updatedAt,
  };
}

@Injectable()
export class ResolveAdmissionWorkflowPolicyService {
  constructor(
    private readonly admissionWorkflowPolicyRepository: AdmissionWorkflowPolicyRepository,
  ) {}

  async resolveForCurrentSchool(): Promise<ResolvedAdmissionWorkflowPolicy> {
    const scope = requireApplicationsScope();
    const record = await this.admissionWorkflowPolicyRepository.findBySchoolId(
      scope.schoolId,
    );

    return resolveAdmissionWorkflowPolicyRecord(record);
  }
}

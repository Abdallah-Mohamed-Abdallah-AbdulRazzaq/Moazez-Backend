import { Injectable } from '@nestjs/common';
import {
  EffectiveAttendancePolicyQueryDto,
  EffectiveAttendancePolicyResponseDto,
} from '../dto/attendance-policy.dto';
import {
  buildEffectiveScopeCandidates,
  scopePriority,
  selectEffectivePolicy,
} from '../domain/policy-scope';
import { AttendancePoliciesRepository } from '../infrastructure/attendance-policies.repository';
import { presentAttendancePolicy } from '../presenters/attendance-policy.presenter';
import {
  resolveAcademicYearId,
  resolveEffectiveRequestScope,
  validateAcademicPolicyContext,
} from './policy-use-case.helpers';

@Injectable()
export class GetEffectiveAttendancePolicyUseCase {
  constructor(
    private readonly attendancePoliciesRepository: AttendancePoliciesRepository,
  ) {}

  async execute(
    query: EffectiveAttendancePolicyQueryDto,
  ): Promise<EffectiveAttendancePolicyResponseDto> {
    const academicYearId = resolveAcademicYearId(query);
    await validateAcademicPolicyContext(
      this.attendancePoliciesRepository,
      academicYearId,
      query.termId,
    );

    const requestScope = await resolveEffectiveRequestScope(
      this.attendancePoliciesRepository,
      query,
    );
    const candidates = buildEffectiveScopeCandidates(requestScope);
    const date = query.date ? new Date(query.date) : undefined;
    const candidatePolicies =
      await this.attendancePoliciesRepository.findEffectiveCandidates({
        academicYearId,
        termId: query.termId,
        candidates,
        date,
      });
    const policy = selectEffectivePolicy(candidatePolicies, candidates, date);

    return {
      policy: policy ? presentAttendancePolicy(policy) : null,
      requestedScope: {
        scopeType: requestScope.scopeType,
        scopeKey: requestScope.scopeKey,
      },
      matchedScope: policy
        ? {
            scopeType: policy.scopeType,
            scopeKey: policy.scopeKey,
            priority: scopePriority(policy.scopeType),
          }
        : null,
    };
  }
}

import { Injectable } from '@nestjs/common';
import {
  ValidateAttendancePolicyNameQueryDto,
  ValidateAttendancePolicyNameResponseDto,
} from '../dto/attendance-policy.dto';
import { AttendancePoliciesRepository } from '../infrastructure/attendance-policies.repository';
import {
  normalizePolicyNames,
  normalizeQueryScopeInput,
  resolveAcademicYearId,
  resolvePolicyScope,
  validateAcademicPolicyContext,
  validateAtLeastOneName,
} from './policy-use-case.helpers';

@Injectable()
export class ValidateAttendancePolicyNameUseCase {
  constructor(
    private readonly attendancePoliciesRepository: AttendancePoliciesRepository,
  ) {}

  async execute(
    query: ValidateAttendancePolicyNameQueryDto,
  ): Promise<ValidateAttendancePolicyNameResponseDto> {
    validateAtLeastOneName(query);

    const academicYearId = resolveAcademicYearId(query);
    await validateAcademicPolicyContext(
      this.attendancePoliciesRepository,
      academicYearId,
      query.termId,
    );

    const policyScope = await resolvePolicyScope(
      this.attendancePoliciesRepository,
      normalizeQueryScopeInput(query),
    );
    const names = normalizePolicyNames(query);
    const conflicts = await this.attendancePoliciesRepository.findNameConflicts(
      {
        academicYearId,
        termId: query.termId,
        scopeType: policyScope.scopeType,
        scopeKey: policyScope.scopeKey,
        excludeId: query.excludeId,
        nameAr: names.nameAr,
        nameEn: names.nameEn,
      },
    );

    const uniqueAr = names.nameAr
      ? !conflicts.some((policy) => policy.nameAr === names.nameAr)
      : true;
    const uniqueEn = names.nameEn
      ? !conflicts.some((policy) => policy.nameEn === names.nameEn)
      : true;

    return {
      uniqueAr,
      uniqueEn,
      available: uniqueAr && uniqueEn,
    };
  }
}

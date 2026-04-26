import { Injectable } from '@nestjs/common';
import { requireAttendanceScope } from '../../attendance-context';
import { CreateAttendancePolicyDto } from '../dto/attendance-policy.dto';
import {
  AttendancePolicyConflictException,
  isUniqueConstraintError,
} from '../domain/policy.exceptions';
import { AttendancePoliciesRepository } from '../infrastructure/attendance-policies.repository';
import { presentAttendancePolicy } from '../presenters/attendance-policy.presenter';
import {
  assertTermWritable,
  buildCreatePolicyData,
  normalizePolicyNames,
  resolveAcademicYearId,
  resolvePolicyScope,
  validateAcademicPolicyContext,
} from './policy-use-case.helpers';

@Injectable()
export class CreateAttendancePolicyUseCase {
  constructor(
    private readonly attendancePoliciesRepository: AttendancePoliciesRepository,
  ) {}

  async execute(command: CreateAttendancePolicyDto) {
    const scope = requireAttendanceScope();
    const academicYearId = resolveAcademicYearId(command);
    const { term } = await validateAcademicPolicyContext(
      this.attendancePoliciesRepository,
      academicYearId,
      command.termId,
    );
    assertTermWritable(term);

    const policyScope = await resolvePolicyScope(
      this.attendancePoliciesRepository,
      command,
    );
    const names = normalizePolicyNames(command);

    await this.assertNoConflicts({
      academicYearId,
      termId: command.termId,
      scopeType: policyScope.scopeType,
      scopeKey: policyScope.scopeKey,
      isActive: command.isActive ?? true,
      nameAr: names.nameAr,
      nameEn: names.nameEn,
    });

    try {
      const policy = await this.attendancePoliciesRepository.create(
        buildCreatePolicyData({
          schoolId: scope.schoolId,
          academicYearId,
          termId: command.termId,
          scope: policyScope,
          command,
        }),
      );

      return presentAttendancePolicy(policy);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AttendancePolicyConflictException({
          academicYearId,
          termId: command.termId,
          scopeType: policyScope.scopeType,
          scopeKey: policyScope.scopeKey,
        });
      }

      throw error;
    }
  }

  private async assertNoConflicts(params: {
    academicYearId: string;
    termId: string;
    scopeType: CreateAttendancePolicyDto['scopeType'];
    scopeKey: string;
    isActive: boolean;
    nameAr?: string;
    nameEn?: string;
  }): Promise<void> {
    const [activeScopeConflict, nameConflicts] = await Promise.all([
      params.isActive
        ? this.attendancePoliciesRepository.findActiveScopeConflict(params)
        : Promise.resolve(null),
      this.attendancePoliciesRepository.findNameConflicts(params),
    ]);

    if (activeScopeConflict || nameConflicts.length > 0) {
      throw new AttendancePolicyConflictException({
        academicYearId: params.academicYearId,
        termId: params.termId,
        scopeType: params.scopeType,
        scopeKey: params.scopeKey,
      });
    }
  }
}

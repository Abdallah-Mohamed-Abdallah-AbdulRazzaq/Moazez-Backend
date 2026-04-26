import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { UpdateAttendancePolicyDto } from '../dto/attendance-policy.dto';
import {
  AttendancePolicyConflictException,
  isUniqueConstraintError,
} from '../domain/policy.exceptions';
import { NormalizedAttendancePolicyScope } from '../domain/policy-scope';
import {
  AttendancePoliciesRepository,
  AttendancePolicyRecord,
} from '../infrastructure/attendance-policies.repository';
import { presentAttendancePolicy } from '../presenters/attendance-policy.presenter';
import {
  assertTermWritable,
  buildUpdatePolicyData,
  hasScopePatch,
  mergePolicyScopeInput,
  normalizePolicyNames,
  resolveAcademicYearId,
  resolvePolicyScope,
  validateAcademicPolicyContext,
} from './policy-use-case.helpers';

@Injectable()
export class UpdateAttendancePolicyUseCase {
  constructor(
    private readonly attendancePoliciesRepository: AttendancePoliciesRepository,
  ) {}

  async execute(policyId: string, command: UpdateAttendancePolicyDto) {
    const existing = await this.attendancePoliciesRepository.findById(policyId);
    if (!existing) {
      throw new NotFoundDomainException('Attendance policy not found', {
        policyId,
      });
    }

    const academicYearId =
      command.academicYearId ?? command.yearId ?? existing.academicYearId;
    const termId = command.termId ?? existing.termId;
    const { term } = await validateAcademicPolicyContext(
      this.attendancePoliciesRepository,
      academicYearId,
      termId,
    );
    assertTermWritable(term);

    const policyScope = hasScopePatch(command)
      ? await resolvePolicyScope(
          this.attendancePoliciesRepository,
          mergePolicyScopeInput(existing, command),
        )
      : this.existingScope(existing);

    const names = normalizePolicyNames({
      nameAr: command.nameAr ?? existing.nameAr,
      nameEn: command.nameEn ?? existing.nameEn,
    });
    const nextIsActive = command.isActive ?? existing.isActive;

    await this.assertNoConflicts({
      policyId,
      academicYearId,
      termId,
      scopeType: policyScope.scopeType,
      scopeKey: policyScope.scopeKey,
      isActive: nextIsActive,
      nameAr: names.nameAr,
      nameEn: names.nameEn,
    });

    try {
      const updated = await this.attendancePoliciesRepository.update(
        policyId,
        buildUpdatePolicyData({
          existing,
          academicYearId,
          termId,
          scope: policyScope,
          command,
        }),
      );

      return presentAttendancePolicy(updated);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AttendancePolicyConflictException({
          policyId,
          academicYearId,
          termId,
          scopeType: policyScope.scopeType,
          scopeKey: policyScope.scopeKey,
        });
      }

      throw error;
    }
  }

  private async assertNoConflicts(params: {
    policyId: string;
    academicYearId: string;
    termId: string;
    scopeType: AttendancePolicyRecord['scopeType'];
    scopeKey: string;
    isActive: boolean;
    nameAr?: string;
    nameEn?: string;
  }): Promise<void> {
    const [activeScopeConflict, nameConflicts] = await Promise.all([
      params.isActive
        ? this.attendancePoliciesRepository.findActiveScopeConflict({
            ...params,
            excludeId: params.policyId,
          })
        : Promise.resolve(null),
      this.attendancePoliciesRepository.findNameConflicts({
        ...params,
        excludeId: params.policyId,
      }),
    ]);

    if (activeScopeConflict || nameConflicts.length > 0) {
      throw new AttendancePolicyConflictException({
        policyId: params.policyId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        scopeType: params.scopeType,
        scopeKey: params.scopeKey,
      });
    }
  }

  private existingScope(
    policy: AttendancePolicyRecord,
  ): NormalizedAttendancePolicyScope {
    return {
      scopeType: policy.scopeType,
      scopeKey: policy.scopeKey,
      stageId: policy.stageId,
      gradeId: policy.gradeId,
      sectionId: policy.sectionId,
      classroomId: policy.classroomId,
    };
  }
}

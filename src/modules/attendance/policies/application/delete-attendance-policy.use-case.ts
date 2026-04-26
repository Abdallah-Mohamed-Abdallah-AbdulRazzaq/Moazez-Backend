import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { DeleteAttendancePolicyResponseDto } from '../dto/attendance-policy.dto';
import { AttendancePoliciesRepository } from '../infrastructure/attendance-policies.repository';
import {
  assertTermWritable,
  validateAcademicPolicyContext,
} from './policy-use-case.helpers';

@Injectable()
export class DeleteAttendancePolicyUseCase {
  constructor(
    private readonly attendancePoliciesRepository: AttendancePoliciesRepository,
  ) {}

  async execute(policyId: string): Promise<DeleteAttendancePolicyResponseDto> {
    const existing = await this.attendancePoliciesRepository.findById(policyId);
    if (!existing) {
      throw new NotFoundDomainException('Attendance policy not found', {
        policyId,
      });
    }

    const { term } = await validateAcademicPolicyContext(
      this.attendancePoliciesRepository,
      existing.academicYearId,
      existing.termId,
    );
    assertTermWritable(term);

    await this.attendancePoliciesRepository.softDelete(policyId);

    return { ok: true };
  }
}

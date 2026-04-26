import { Injectable } from '@nestjs/common';
import { ListAttendancePoliciesQueryDto } from '../dto/attendance-policy.dto';
import { AttendancePoliciesRepository } from '../infrastructure/attendance-policies.repository';
import { presentAttendancePolicies } from '../presenters/attendance-policy.presenter';

@Injectable()
export class ListAttendancePoliciesUseCase {
  constructor(
    private readonly attendancePoliciesRepository: AttendancePoliciesRepository,
  ) {}

  async execute(query: ListAttendancePoliciesQueryDto) {
    const policies = await this.attendancePoliciesRepository.list({
      academicYearId: query.academicYearId ?? query.yearId,
      termId: query.termId,
      scopeType: query.scopeType,
      scopeKey: query.scopeKey,
      scopeId: query.scopeId,
      stageId: query.stageId,
      gradeId: query.gradeId,
      sectionId: query.sectionId,
      classroomId: query.classroomId,
      isActive: query.isActive,
    });

    return presentAttendancePolicies(policies);
  }
}

import { Injectable } from '@nestjs/common';
import { parseOptionalBoolean } from '../../shared/dismissal.types';
import {
  DismissalStaffAssignmentsListResponseDto,
  ListDismissalStaffAssignmentsQueryDto,
} from '../dto/dismissal-staff-assignment.dto';
import { DismissalStaffAssignmentsRepository } from '../infrastructure/dismissal-staff-assignments.repository';
import { presentDismissalStaffAssignment } from '../presenter/dismissal-staff-assignment.presenter';

@Injectable()
export class ListDismissalStaffAssignmentsUseCase {
  constructor(
    private readonly dismissalStaffAssignmentsRepository: DismissalStaffAssignmentsRepository,
  ) {}

  async execute(
    query: ListDismissalStaffAssignmentsQueryDto,
  ): Promise<DismissalStaffAssignmentsListResponseDto> {
    const result =
      await this.dismissalStaffAssignmentsRepository.listAssignments(
        {
          staffUserId: query.staffUserId,
          gateId: query.gateId,
          stageId: query.stageId,
          gradeId: query.gradeId,
          sectionId: query.sectionId,
          classroomId: query.classroomId,
          isActive: parseOptionalBoolean(query.active),
          isLead: parseOptionalBoolean(query.lead),
          q: query.q?.trim() || undefined,
        },
        { page: query.page, limit: query.limit },
      );

    return {
      data: result.assignments.map(presentDismissalStaffAssignment),
      summary: result.summary,
    };
  }
}

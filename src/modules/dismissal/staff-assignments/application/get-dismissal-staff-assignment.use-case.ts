import { Injectable } from '@nestjs/common';
import { DismissalStaffAssignmentNotFoundException } from '../../shared/dismissal.errors';
import { DismissalStaffAssignmentResponseDto } from '../dto/dismissal-staff-assignment.dto';
import { DismissalStaffAssignmentsRepository } from '../infrastructure/dismissal-staff-assignments.repository';
import { presentDismissalStaffAssignment } from '../presenter/dismissal-staff-assignment.presenter';

@Injectable()
export class GetDismissalStaffAssignmentUseCase {
  constructor(
    private readonly dismissalStaffAssignmentsRepository: DismissalStaffAssignmentsRepository,
  ) {}

  async execute(assignmentId: string): Promise<DismissalStaffAssignmentResponseDto> {
    const assignment =
      await this.dismissalStaffAssignmentsRepository.findAssignmentById(
        assignmentId,
      );
    if (!assignment) {
      throw new DismissalStaffAssignmentNotFoundException();
    }

    return presentDismissalStaffAssignment(assignment);
  }
}

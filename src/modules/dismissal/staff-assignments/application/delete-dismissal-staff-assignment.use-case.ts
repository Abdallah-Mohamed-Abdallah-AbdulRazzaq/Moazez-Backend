import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireDismissalScope } from '../../shared/dismissal-context';
import { DismissalStaffAssignmentNotFoundException } from '../../shared/dismissal.errors';
import { DeleteDismissalStaffAssignmentResponseDto } from '../dto/dismissal-staff-assignment.dto';
import {
  DismissalStaffAssignmentRecord,
  DismissalStaffAssignmentsRepository,
} from '../infrastructure/dismissal-staff-assignments.repository';

@Injectable()
export class DeleteDismissalStaffAssignmentUseCase {
  constructor(
    private readonly dismissalStaffAssignmentsRepository: DismissalStaffAssignmentsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    assignmentId: string,
  ): Promise<DeleteDismissalStaffAssignmentResponseDto> {
    const dismissalScope = requireDismissalScope();
    const existing =
      await this.dismissalStaffAssignmentsRepository.findAssignmentById(
        assignmentId,
      );
    if (!existing) {
      throw new DismissalStaffAssignmentNotFoundException();
    }

    const updated =
      await this.dismissalStaffAssignmentsRepository.updateAssignment(
        assignmentId,
        {
          deletedAt: new Date(),
          isActive: false,
          updatedById: dismissalScope.actorId,
        },
      );

    await this.authRepository.createAuditLog({
      actorId: dismissalScope.actorId,
      userType: dismissalScope.userType,
      organizationId: dismissalScope.organizationId,
      schoolId: dismissalScope.schoolId,
      module: 'dismissal',
      action: 'dismissal.staff_assignment.delete',
      resourceType: 'dismissal_staff_assignment',
      resourceId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      before: this.auditAssignment(existing),
      after: this.auditAssignment(updated),
    });

    return { id: updated.id, deleted: true };
  }

  private auditAssignment(
    assignment: DismissalStaffAssignmentRecord,
  ): Record<string, unknown> {
    return {
      staffUserId: assignment.staffUserId,
      gateId: assignment.gateId,
      stageId: assignment.stageId,
      gradeId: assignment.gradeId,
      sectionId: assignment.sectionId,
      classroomId: assignment.classroomId,
      isLead: assignment.isLead,
      isActive: assignment.isActive,
      startsAt: assignment.startsAt?.toISOString() ?? null,
      endsAt: assignment.endsAt?.toISOString() ?? null,
    };
  }
}

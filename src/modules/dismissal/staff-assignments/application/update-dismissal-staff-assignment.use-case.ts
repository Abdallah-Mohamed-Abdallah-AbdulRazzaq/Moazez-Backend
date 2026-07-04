import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma, UserType } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireDismissalScope } from '../../shared/dismissal-context';
import {
  DismissalStaffAssignmentClassroomNotFoundException,
  DismissalStaffAssignmentDuplicateActiveException,
  DismissalStaffAssignmentGateNotFoundException,
  DismissalStaffAssignmentGradeNotFoundException,
  DismissalStaffAssignmentNotFoundException,
  DismissalStaffAssignmentSectionNotFoundException,
  DismissalStaffAssignmentStaffNotDismissalStaffException,
  DismissalStaffAssignmentStaffNotFoundException,
  DismissalStaffAssignmentStaffNotInSchoolException,
  DismissalStaffAssignmentStageNotFoundException,
} from '../../shared/dismissal.errors';
import {
  DismissalStaffAssignmentResponseDto,
  UpdateDismissalStaffAssignmentDto,
} from '../dto/dismissal-staff-assignment.dto';
import {
  DismissalAssignmentScopeIds,
  DismissalStaffAssignmentRecord,
  DismissalStaffAssignmentsRepository,
} from '../infrastructure/dismissal-staff-assignments.repository';
import { presentDismissalStaffAssignment } from '../presenter/dismissal-staff-assignment.presenter';
import {
  hasOwn,
  normalizeOptionalText,
  parseOptionalDate,
  validateAcademicScopeConsistency,
  validateScopeRequired,
  validateTimeWindow,
} from './dismissal-staff-assignment-inputs';

@Injectable()
export class UpdateDismissalStaffAssignmentUseCase {
  constructor(
    private readonly dismissalStaffAssignmentsRepository: DismissalStaffAssignmentsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    assignmentId: string,
    command: UpdateDismissalStaffAssignmentDto,
  ): Promise<DismissalStaffAssignmentResponseDto> {
    const dismissalScope = requireDismissalScope();
    const existing =
      await this.dismissalStaffAssignmentsRepository.findAssignmentById(
        assignmentId,
      );
    if (!existing) {
      throw new DismissalStaffAssignmentNotFoundException();
    }

    const staffUserId = hasOwn(command, 'staffUserId')
      ? String(command.staffUserId)
      : existing.staffUserId;
    await this.validateStaffUser(staffUserId);

    const assignmentScope: DismissalAssignmentScopeIds = {
      gateId: hasOwn(command, 'gateId') ? command.gateId ?? null : existing.gateId,
      stageId: hasOwn(command, 'stageId')
        ? command.stageId ?? null
        : existing.stageId,
      gradeId: hasOwn(command, 'gradeId')
        ? command.gradeId ?? null
        : existing.gradeId,
      sectionId: hasOwn(command, 'sectionId')
        ? command.sectionId ?? null
        : existing.sectionId,
      classroomId: hasOwn(command, 'classroomId')
        ? command.classroomId ?? null
        : existing.classroomId,
    };
    await this.validateAssignmentScope(assignmentScope);

    const startsAt = hasOwn(command, 'startsAt')
      ? parseOptionalDate(command.startsAt)
      : existing.startsAt;
    const endsAt = hasOwn(command, 'endsAt')
      ? parseOptionalDate(command.endsAt)
      : existing.endsAt;
    validateTimeWindow({ startsAt, endsAt });

    const isActive = hasOwn(command, 'isActive')
      ? Boolean(command.isActive)
      : existing.isActive;
    if (isActive) {
      const duplicate =
        await this.dismissalStaffAssignmentsRepository.findDuplicateActiveAssignment(
          {
            staffUserId,
            scope: assignmentScope,
            excludeAssignmentId: assignmentId,
          },
        );
      if (duplicate) {
        throw new DismissalStaffAssignmentDuplicateActiveException();
      }
    }

    const data: Prisma.DismissalStaffAssignmentUncheckedUpdateInput = {
      updatedById: dismissalScope.actorId,
    };

    if (hasOwn(command, 'staffUserId')) data.staffUserId = staffUserId;
    if (hasOwn(command, 'gateId')) data.gateId = assignmentScope.gateId;
    if (hasOwn(command, 'stageId')) data.stageId = assignmentScope.stageId;
    if (hasOwn(command, 'gradeId')) data.gradeId = assignmentScope.gradeId;
    if (hasOwn(command, 'sectionId')) data.sectionId = assignmentScope.sectionId;
    if (hasOwn(command, 'classroomId')) {
      data.classroomId = assignmentScope.classroomId;
    }
    if (hasOwn(command, 'isLead')) data.isLead = Boolean(command.isLead);
    if (hasOwn(command, 'isActive')) data.isActive = isActive;
    if (hasOwn(command, 'startsAt')) data.startsAt = startsAt;
    if (hasOwn(command, 'endsAt')) data.endsAt = endsAt;
    if (hasOwn(command, 'notes')) {
      data.notes = normalizeOptionalText(command.notes, 4000);
    }

    const updated =
      await this.dismissalStaffAssignmentsRepository.updateAssignment(
        assignmentId,
        data,
      );

    await this.authRepository.createAuditLog({
      actorId: dismissalScope.actorId,
      userType: dismissalScope.userType,
      organizationId: dismissalScope.organizationId,
      schoolId: dismissalScope.schoolId,
      module: 'dismissal',
      action: 'dismissal.staff_assignment.update',
      resourceType: 'dismissal_staff_assignment',
      resourceId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      before: this.auditAssignment(existing),
      after: this.auditAssignment(updated),
    });

    return presentDismissalStaffAssignment(updated);
  }

  private async validateStaffUser(staffUserId: string): Promise<void> {
    const user =
      await this.dismissalStaffAssignmentsRepository.findStaffUser(staffUserId);
    if (!user) {
      throw new DismissalStaffAssignmentStaffNotFoundException();
    }
    if (user.userType !== UserType.DISMISSAL_STAFF) {
      throw new DismissalStaffAssignmentStaffNotDismissalStaffException();
    }

    const hasMembership =
      await this.dismissalStaffAssignmentsRepository.hasActiveStaffMembership(
        staffUserId,
      );
    if (!hasMembership) {
      throw new DismissalStaffAssignmentStaffNotInSchoolException();
    }
  }

  private async validateAssignmentScope(
    assignmentScope: DismissalAssignmentScopeIds,
  ): Promise<void> {
    validateScopeRequired(assignmentScope);

    const [gate, stage, grade, section, classroom] = await Promise.all([
      assignmentScope.gateId
        ? this.dismissalStaffAssignmentsRepository.findGateById(
            assignmentScope.gateId,
          )
        : Promise.resolve(null),
      assignmentScope.stageId
        ? this.dismissalStaffAssignmentsRepository.findStageById(
            assignmentScope.stageId,
          )
        : Promise.resolve(null),
      assignmentScope.gradeId
        ? this.dismissalStaffAssignmentsRepository.findGradeById(
            assignmentScope.gradeId,
          )
        : Promise.resolve(null),
      assignmentScope.sectionId
        ? this.dismissalStaffAssignmentsRepository.findSectionById(
            assignmentScope.sectionId,
          )
        : Promise.resolve(null),
      assignmentScope.classroomId
        ? this.dismissalStaffAssignmentsRepository.findClassroomById(
            assignmentScope.classroomId,
          )
        : Promise.resolve(null),
    ]);

    if (assignmentScope.gateId && !gate) {
      throw new DismissalStaffAssignmentGateNotFoundException();
    }
    if (assignmentScope.stageId && !stage) {
      throw new DismissalStaffAssignmentStageNotFoundException();
    }
    if (assignmentScope.gradeId && !grade) {
      throw new DismissalStaffAssignmentGradeNotFoundException();
    }
    if (assignmentScope.sectionId && !section) {
      throw new DismissalStaffAssignmentSectionNotFoundException();
    }
    if (assignmentScope.classroomId && !classroom) {
      throw new DismissalStaffAssignmentClassroomNotFoundException();
    }

    validateAcademicScopeConsistency({
      scope: assignmentScope,
      records: { stage, grade, section, classroom },
    });
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

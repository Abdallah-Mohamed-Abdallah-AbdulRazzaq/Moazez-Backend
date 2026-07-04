import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserType } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireDismissalScope } from '../../shared/dismissal-context';
import {
  DismissalStaffAssignmentClassroomNotFoundException,
  DismissalStaffAssignmentDuplicateActiveException,
  DismissalStaffAssignmentGateNotFoundException,
  DismissalStaffAssignmentGradeNotFoundException,
  DismissalStaffAssignmentSectionNotFoundException,
  DismissalStaffAssignmentStaffNotDismissalStaffException,
  DismissalStaffAssignmentStaffNotFoundException,
  DismissalStaffAssignmentStaffNotInSchoolException,
  DismissalStaffAssignmentStageNotFoundException,
} from '../../shared/dismissal.errors';
import {
  CreateDismissalStaffAssignmentDto,
  DismissalStaffAssignmentResponseDto,
} from '../dto/dismissal-staff-assignment.dto';
import {
  DismissalAssignmentScopeIds,
  DismissalStaffAssignmentsRepository,
} from '../infrastructure/dismissal-staff-assignments.repository';
import { presentDismissalStaffAssignment } from '../presenter/dismissal-staff-assignment.presenter';
import {
  normalizeOptionalText,
  parseOptionalDate,
  validateAcademicScopeConsistency,
  validateScopeRequired,
  validateTimeWindow,
} from './dismissal-staff-assignment-inputs';

@Injectable()
export class CreateDismissalStaffAssignmentUseCase {
  constructor(
    private readonly dismissalStaffAssignmentsRepository: DismissalStaffAssignmentsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: CreateDismissalStaffAssignmentDto,
  ): Promise<DismissalStaffAssignmentResponseDto> {
    const dismissalScope = requireDismissalScope();
    await this.validateStaffUser(command.staffUserId);

    const assignmentScope: DismissalAssignmentScopeIds = {
      gateId: command.gateId ?? null,
      stageId: command.stageId ?? null,
      gradeId: command.gradeId ?? null,
      sectionId: command.sectionId ?? null,
      classroomId: command.classroomId ?? null,
    };
    await this.validateAssignmentScope(assignmentScope);

    const startsAt = parseOptionalDate(command.startsAt);
    const endsAt = parseOptionalDate(command.endsAt);
    validateTimeWindow({ startsAt, endsAt });

    const isActive = command.isActive ?? true;
    if (isActive) {
      const duplicate =
        await this.dismissalStaffAssignmentsRepository.findDuplicateActiveAssignment(
          {
            staffUserId: command.staffUserId,
            scope: assignmentScope,
          },
        );
      if (duplicate) {
        throw new DismissalStaffAssignmentDuplicateActiveException();
      }
    }

    const assignment =
      await this.dismissalStaffAssignmentsRepository.createAssignment({
        schoolId: dismissalScope.schoolId,
        staffUserId: command.staffUserId,
        gateId: assignmentScope.gateId,
        stageId: assignmentScope.stageId,
        gradeId: assignmentScope.gradeId,
        sectionId: assignmentScope.sectionId,
        classroomId: assignmentScope.classroomId,
        isLead: command.isLead ?? false,
        isActive,
        startsAt,
        endsAt,
        notes: normalizeOptionalText(command.notes, 4000),
        createdById: dismissalScope.actorId,
        updatedById: dismissalScope.actorId,
      });

    await this.authRepository.createAuditLog({
      actorId: dismissalScope.actorId,
      userType: dismissalScope.userType,
      organizationId: dismissalScope.organizationId,
      schoolId: dismissalScope.schoolId,
      module: 'dismissal',
      action: 'dismissal.staff_assignment.create',
      resourceType: 'dismissal_staff_assignment',
      resourceId: assignment.id,
      outcome: AuditOutcome.SUCCESS,
      after: this.auditAssignment(assignment),
    });

    return presentDismissalStaffAssignment(assignment);
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

  private auditAssignment(assignment: {
    staffUserId: string;
    gateId: string | null;
    stageId: string | null;
    gradeId: string | null;
    sectionId: string | null;
    classroomId: string | null;
    isLead: boolean;
    isActive: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
  }): Record<string, unknown> {
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

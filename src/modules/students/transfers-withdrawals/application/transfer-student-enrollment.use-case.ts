import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { StudentEnrollmentPlacementConflictException } from '../../enrollments/domain/enrollment.exceptions';
import { EnrollmentPlacementService } from '../../enrollments/domain/enrollment-placement.service';
import { EnrollmentsRepository } from '../../enrollments/infrastructure/enrollments.repository';
import {
  EnrollmentMovementResponseDto,
  TransferEnrollmentDto,
} from '../dto/enrollment-lifecycle.dto';
import { StudentEnrollmentAlreadyWithdrawnException } from '../domain/lifecycle.exceptions';
import { presentEnrollmentMovement } from '../presenters/enrollment-lifecycle.presenter';
import {
  assertPlacementCapacity,
  assertPlacementChanged,
  normalizeOptionalText,
  requireStudentWithActiveEnrollment,
  toLifecycleDate,
  writeLifecycleAuditLog,
} from './shared';

@Injectable()
export class TransferStudentEnrollmentUseCase {
  constructor(
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly studentsRepository: StudentsRepository,
    private readonly enrollmentPlacementService: EnrollmentPlacementService,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: TransferEnrollmentDto,
  ): Promise<EnrollmentMovementResponseDto> {
    const { activeEnrollment } = await requireStudentWithActiveEnrollment({
      studentId: command.studentId,
      studentsRepository: this.studentsRepository,
      enrollmentsRepository: this.enrollmentsRepository,
    });

    const resolvedPlacement =
      await this.enrollmentPlacementService.resolvePlacement(
        {
          studentId: command.studentId,
          academicYearId: activeEnrollment.academicYearId,
          sectionId: command.targetSectionId,
          classroomId: command.targetClassroomId,
          termId: activeEnrollment.termId ?? undefined,
          enrollmentDate: command.effectiveDate,
        },
        {
          ignoreEnrollmentId: activeEnrollment.id,
        },
      );

    assertPlacementChanged({
      currentEnrollment: activeEnrollment,
      nextAcademicYearId: resolvedPlacement.academicYear.id,
      nextClassroomId: resolvedPlacement.classroom.id,
      nextTermId: activeEnrollment.termId,
    });

    if (resolvedPlacement.section.id !== command.targetSectionId) {
      throw new StudentEnrollmentPlacementConflictException({
        sectionId: command.targetSectionId,
        classroomId: command.targetClassroomId,
      });
    }

    await assertPlacementCapacity({
      enrollmentsRepository: this.enrollmentsRepository,
      academicYearId: resolvedPlacement.academicYear.id,
      classroom: resolvedPlacement.classroom,
    });

    const transition =
      await this.enrollmentsRepository.completeEnrollmentAndCreateNext({
        currentEnrollmentId: activeEnrollment.id,
        effectiveDate: toLifecycleDate(command.effectiveDate),
        exitReason: normalizeOptionalText(command.reason) ?? 'Transferred',
        newEnrollment: {
          schoolId: activeEnrollment.schoolId,
          studentId: activeEnrollment.studentId,
          academicYearId: resolvedPlacement.academicYear.id,
          termId: activeEnrollment.termId,
          classroomId: resolvedPlacement.classroom.id,
          enrolledAt: toLifecycleDate(command.effectiveDate),
        },
      });

    if (!transition) {
      throw new StudentEnrollmentAlreadyWithdrawnException({
        studentId: command.studentId,
      });
    }

    await writeLifecycleAuditLog({
      authRepository: this.authRepository,
      action: 'students.enrollment.transfer',
      resourceId: transition.nextEnrollment.id,
      beforeEnrollment: activeEnrollment,
      afterEnrollment: transition.nextEnrollment,
      effectiveDate: command.effectiveDate,
      reason: command.reason,
      notes: command.notes,
      sourceRequestId: command.sourceRequestId ?? null,
      actionType: 'transferred_internal',
    });

    return presentEnrollmentMovement({
      id: transition.nextEnrollment.id,
      actionType: 'transferred_internal',
      fromEnrollment: transition.previousEnrollment,
      toEnrollment: transition.nextEnrollment,
      effectiveDate: toLifecycleDate(command.effectiveDate),
      reason: command.reason,
      notes: command.notes,
      sourceRequestId: command.sourceRequestId ?? null,
      createdAt: transition.nextEnrollment.createdAt,
    });
  }
}

import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { EnrollmentsRepository } from '../../enrollments/infrastructure/enrollments.repository';
import {
  EnrollmentMovementResponseDto,
  PromoteEnrollmentDto,
} from '../dto/enrollment-lifecycle.dto';
import { StudentEnrollmentAlreadyWithdrawnException } from '../domain/lifecycle.exceptions';
import { PromotionPlacementService } from '../domain/promotion-placement.service';
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
export class PromoteStudentEnrollmentUseCase {
  constructor(
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly studentsRepository: StudentsRepository,
    private readonly promotionPlacementService: PromotionPlacementService,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: PromoteEnrollmentDto,
  ): Promise<EnrollmentMovementResponseDto> {
    const { activeEnrollment } = await requireStudentWithActiveEnrollment({
      studentId: command.studentId,
      studentsRepository: this.studentsRepository,
      enrollmentsRepository: this.enrollmentsRepository,
    });

    const resolvedPlacement = await this.promotionPlacementService.resolvePlacement({
      activeEnrollment,
      targetAcademicYear: command.targetAcademicYear,
      effectiveDate: command.effectiveDate,
    });

    assertPlacementChanged({
      currentEnrollment: activeEnrollment,
      nextAcademicYearId: resolvedPlacement.academicYear.id,
      nextClassroomId: resolvedPlacement.classroom.id,
      nextTermId: null,
    });

    await assertPlacementCapacity({
      enrollmentsRepository: this.enrollmentsRepository,
      academicYearId: resolvedPlacement.academicYear.id,
      classroom: resolvedPlacement.classroom,
    });

    const transition =
      await this.enrollmentsRepository.completeEnrollmentAndCreateNext({
        currentEnrollmentId: activeEnrollment.id,
        effectiveDate: toLifecycleDate(command.effectiveDate),
        exitReason: normalizeOptionalText(command.notes) ?? 'Promoted',
        newEnrollment: {
          schoolId: activeEnrollment.schoolId,
          studentId: activeEnrollment.studentId,
          academicYearId: resolvedPlacement.academicYear.id,
          termId: null,
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
      action: 'students.enrollment.promote',
      resourceId: transition.nextEnrollment.id,
      beforeEnrollment: activeEnrollment,
      afterEnrollment: transition.nextEnrollment,
      effectiveDate: command.effectiveDate,
      notes: command.notes,
      actionType: 'promoted',
    });

    return presentEnrollmentMovement({
      id: transition.nextEnrollment.id,
      actionType: 'promoted',
      fromEnrollment: transition.previousEnrollment,
      toEnrollment: transition.nextEnrollment,
      effectiveDate: toLifecycleDate(command.effectiveDate),
      notes: command.notes,
      createdAt: transition.nextEnrollment.createdAt,
    });
  }
}

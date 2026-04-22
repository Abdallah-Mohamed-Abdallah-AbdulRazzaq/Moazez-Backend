import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { EnrollmentsRepository } from '../../enrollments/infrastructure/enrollments.repository';
import {
  EnrollmentMovementResponseDto,
  WithdrawEnrollmentDto,
} from '../dto/enrollment-lifecycle.dto';
import { StudentEnrollmentAlreadyWithdrawnException } from '../domain/lifecycle.exceptions';
import { presentEnrollmentMovement } from '../presenters/enrollment-lifecycle.presenter';
import {
  normalizeOptionalText,
  requireStudentWithActiveEnrollment,
  toLifecycleDate,
  writeLifecycleAuditLog,
} from './shared';

@Injectable()
export class WithdrawStudentEnrollmentUseCase {
  constructor(
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly studentsRepository: StudentsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: WithdrawEnrollmentDto,
  ): Promise<EnrollmentMovementResponseDto> {
    const { activeEnrollment } = await requireStudentWithActiveEnrollment({
      studentId: command.studentId,
      studentsRepository: this.studentsRepository,
      enrollmentsRepository: this.enrollmentsRepository,
    });

    const updatedEnrollment = await this.enrollmentsRepository.withdrawEnrollment({
      enrollmentId: activeEnrollment.id,
      effectiveDate: toLifecycleDate(command.effectiveDate),
      exitReason: normalizeOptionalText(command.reason) ?? 'Withdrawn',
    });

    if (!updatedEnrollment) {
      throw new StudentEnrollmentAlreadyWithdrawnException({
        studentId: command.studentId,
      });
    }

    await writeLifecycleAuditLog({
      authRepository: this.authRepository,
      action: 'students.enrollment.withdraw',
      resourceId: updatedEnrollment.id,
      beforeEnrollment: activeEnrollment,
      afterEnrollment: updatedEnrollment,
      effectiveDate: command.effectiveDate,
      reason: command.reason,
      notes: command.notes,
      sourceRequestId: command.sourceRequestId ?? null,
      actionType: command.actionType,
    });

    return presentEnrollmentMovement({
      id: updatedEnrollment.id,
      actionType: 'withdrawn',
      fromEnrollment: activeEnrollment,
      effectiveDate: toLifecycleDate(command.effectiveDate),
      reason: command.reason,
      notes: command.notes,
      sourceRequestId: command.sourceRequestId ?? null,
      createdAt: updatedEnrollment.updatedAt,
    });
  }
}

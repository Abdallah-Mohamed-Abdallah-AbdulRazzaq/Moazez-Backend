import { Injectable } from '@nestjs/common';
import {
  ACTIVE_STUDENT_SEAT_CALCULATION,
  type ActiveStudentSeatCalculation,
} from '../infrastructure/student-seat-usage.query';
import { PlatformEntitlementStudentSeatLimitExceededException } from '../domain/platform-admin-errors';
import { StudentSeatLimitPolicyRepository } from '../infrastructure/student-seat-limit-policy.repository';

export type StudentSeatLimitReason =
  | 'student_create'
  | 'enrollment_create'
  | 'admissions_handoff'
  | 'promotion'
  | 'transfer'
  | string;

export interface AssertCanIncreaseActiveStudentSeatsCommand {
  schoolId: string;
  incrementBy?: number;
  reason: StudentSeatLimitReason;
  existingStudentId?: string | null;
}

export interface StudentSeatLimitDecision {
  schoolId: string;
  reason: StudentSeatLimitReason;
  limit: number | null;
  used: number;
  remaining: number | null;
  incrementBy: number;
  wouldIncreaseActiveSeats: boolean;
  allowed: boolean;
  calculation: ActiveStudentSeatCalculation;
}

@Injectable()
export class StudentSeatLimitPolicyService {
  constructor(private readonly repository: StudentSeatLimitPolicyRepository) {}

  async assertCanIncreaseActiveStudentSeats(
    command: AssertCanIncreaseActiveStudentSeatsCommand,
  ): Promise<StudentSeatLimitDecision> {
    const requestedIncrement = normalizeIncrement(command.incrementBy);

    const [entitlement, used, existingStudentHasSeat] = await Promise.all([
      this.repository.findEntitlementForCurrentSchool(),
      this.repository.countActiveStudentSeatsForCurrentSchool(),
      command.existingStudentId
        ? this.repository.hasActiveStudentSeatForCurrentSchool(
            command.existingStudentId,
          )
        : Promise.resolve(false),
    ]);

    const limit = entitlement?.studentSeatLimit ?? null;
    const incrementBy = existingStudentHasSeat
      ? Math.max(requestedIncrement - 1, 0)
      : requestedIncrement;
    const wouldIncreaseActiveSeats = incrementBy > 0;
    const remaining = limit === null ? null : Math.max(limit - used, 0);

    const decision: StudentSeatLimitDecision = {
      schoolId: command.schoolId,
      reason: command.reason,
      limit,
      used,
      remaining,
      incrementBy,
      wouldIncreaseActiveSeats,
      allowed:
        !wouldIncreaseActiveSeats ||
        limit === null ||
        used + incrementBy <= limit,
      calculation: ACTIVE_STUDENT_SEAT_CALCULATION,
    };

    if (!decision.allowed && limit !== null) {
      throw new PlatformEntitlementStudentSeatLimitExceededException({
        schoolId: command.schoolId,
        limit,
        used,
        remaining: remaining ?? 0,
        calculation: ACTIVE_STUDENT_SEAT_CALCULATION,
      });
    }

    return decision;
  }
}

function normalizeIncrement(incrementBy?: number): number {
  if (incrementBy === undefined) return 1;
  if (!Number.isFinite(incrementBy)) return 0;
  return Math.max(Math.trunc(incrementBy), 0);
}

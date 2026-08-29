import { Injectable } from '@nestjs/common';
import {
  ACTIVE_STUDENT_SEAT_CALCULATION,
  type ActiveStudentSeatCalculation,
} from '../infrastructure/student-seat-usage.query';
import { PlatformEntitlementStudentSeatLimitExceededException } from '../domain/platform-admin-errors';
import { StudentSeatLimitPolicyRepository } from '../infrastructure/student-seat-limit-policy.repository';

export type StudentSeatLimitReason = string;

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

export interface StudentSeatLimitSnapshot {
  schoolId: string;
  reason: StudentSeatLimitReason;
  limit: number | null;
  used: number;
  incrementBy?: number;
  existingStudentHasSeat: boolean;
}

export function assertStudentSeatLimitSnapshot(
  snapshot: StudentSeatLimitSnapshot,
): StudentSeatLimitDecision {
  const requestedIncrement = normalizeIncrement(snapshot.incrementBy);
  const incrementBy = snapshot.existingStudentHasSeat
    ? Math.max(requestedIncrement - 1, 0)
    : requestedIncrement;
  const wouldIncreaseActiveSeats = incrementBy > 0;
  const remaining =
    snapshot.limit === null
      ? null
      : Math.max(snapshot.limit - snapshot.used, 0);

  const decision: StudentSeatLimitDecision = {
    schoolId: snapshot.schoolId,
    reason: snapshot.reason,
    limit: snapshot.limit,
    used: snapshot.used,
    remaining,
    incrementBy,
    wouldIncreaseActiveSeats,
    allowed:
      !wouldIncreaseActiveSeats ||
      snapshot.limit === null ||
      snapshot.used + incrementBy <= snapshot.limit,
    calculation: ACTIVE_STUDENT_SEAT_CALCULATION,
  };

  if (!decision.allowed && snapshot.limit !== null) {
    throw new PlatformEntitlementStudentSeatLimitExceededException({
      schoolId: snapshot.schoolId,
      limit: snapshot.limit,
      used: snapshot.used,
      remaining: remaining ?? 0,
      calculation: ACTIVE_STUDENT_SEAT_CALCULATION,
    });
  }

  return decision;
}

@Injectable()
export class StudentSeatLimitPolicyService {
  constructor(private readonly repository: StudentSeatLimitPolicyRepository) {}

  async assertCanIncreaseActiveStudentSeats(
    command: AssertCanIncreaseActiveStudentSeatsCommand,
  ): Promise<StudentSeatLimitDecision> {
    const [entitlement, used, existingStudentHasSeat] = await Promise.all([
      this.repository.findEntitlementForCurrentSchool(),
      this.repository.countActiveStudentSeatsForCurrentSchool(),
      command.existingStudentId
        ? this.repository.hasActiveStudentSeatForCurrentSchool(
            command.existingStudentId,
          )
        : Promise.resolve(false),
    ]);

    return assertStudentSeatLimitSnapshot({
      schoolId: command.schoolId,
      reason: command.reason,
      limit: entitlement?.studentSeatLimit ?? null,
      used,
      incrementBy: command.incrementBy,
      existingStudentHasSeat,
    });
  }
}

function normalizeIncrement(incrementBy?: number): number {
  if (incrementBy === undefined) return 1;
  if (!Number.isFinite(incrementBy)) return 0;
  return Math.max(Math.trunc(incrementBy), 0);
}

import { HttpStatus } from '@nestjs/common';
import { StudentEnrollmentStatus, StudentStatus } from '@prisma/client';
import { StudentSeatLimitPolicyService } from '../application/student-seat-limit-policy.service';
import { PlatformEntitlementStudentSeatLimitExceededException } from '../domain/platform-admin-errors';
import { StudentSeatLimitPolicyRepository } from '../infrastructure/student-seat-limit-policy.repository';

describe('StudentSeatLimitPolicyService', () => {
  it('allows active seat increases when the school has no entitlement row', async () => {
    const { policy } = createPolicy({ entitlementLimit: undefined, used: 500 });

    const decision = await policy.assertCanIncreaseActiveStudentSeats({
      schoolId: 'school-1',
      reason: 'enrollment_create',
    });

    expect(decision).toMatchObject({
      schoolId: 'school-1',
      limit: null,
      used: 500,
      remaining: null,
      wouldIncreaseActiveSeats: true,
      allowed: true,
      calculation: 'active_students',
    });
  });

  it('allows active seat increases when the entitlement limit is null', async () => {
    const { policy } = createPolicy({ entitlementLimit: null, used: 500 });

    const decision = await policy.assertCanIncreaseActiveStudentSeats({
      schoolId: 'school-1',
      reason: 'enrollment_create',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBeNull();
  });

  it('allows a single active seat increase while usage is below the limit', async () => {
    const { policy } = createPolicy({ entitlementLimit: 3, used: 2 });

    await expect(
      policy.assertCanIncreaseActiveStudentSeats({
        schoolId: 'school-1',
        reason: 'enrollment_create',
      }),
    ).resolves.toMatchObject({
      limit: 3,
      used: 2,
      remaining: 1,
      allowed: true,
    });
  });

  it('blocks a new active seat when usage is equal to the limit', async () => {
    const { policy } = createPolicy({ entitlementLimit: 3, used: 3 });

    await expect(
      policy.assertCanIncreaseActiveStudentSeats({
        schoolId: 'school-1',
        reason: 'enrollment_create',
      }),
    ).rejects.toMatchObject({
      code: 'platform.entitlement.student_seat_limit_exceeded',
      httpStatus: HttpStatus.CONFLICT,
      details: {
        schoolId: 'school-1',
        limit: 3,
        used: 3,
        remaining: 0,
        calculation: 'active_students',
      },
    });
  });

  it('blocks a new active seat when usage is already over the limit', async () => {
    const { policy } = createPolicy({ entitlementLimit: 3, used: 5 });

    await expect(
      policy.assertCanIncreaseActiveStudentSeats({
        schoolId: 'school-1',
        reason: 'enrollment_create',
      }),
    ).rejects.toBeInstanceOf(
      PlatformEntitlementStudentSeatLimitExceededException,
    );
  });

  it('allows operations that do not increase active seats', async () => {
    const { policy } = createPolicy({ entitlementLimit: 3, used: 5 });

    await expect(
      policy.assertCanIncreaseActiveStudentSeats({
        schoolId: 'school-1',
        incrementBy: 0,
        reason: 'profile_update',
      }),
    ).resolves.toMatchObject({
      used: 5,
      incrementBy: 0,
      wouldIncreaseActiveSeats: false,
      allowed: true,
    });
  });

  it('allows same-student replacement when the student already has an active seat', async () => {
    const { policy, repository } = createPolicy({
      entitlementLimit: 3,
      used: 3,
      existingStudentHasSeat: true,
    });

    const decision = await policy.assertCanIncreaseActiveStudentSeats({
      schoolId: 'school-1',
      existingStudentId: 'student-1',
      reason: 'promotion',
    });

    expect(
      repository.hasActiveStudentSeatForCurrentSchool,
    ).toHaveBeenCalledWith('student-1');
    expect(decision).toMatchObject({
      incrementBy: 0,
      wouldIncreaseActiveSeats: false,
      allowed: true,
    });
  });

  it('keeps decision and error details free of billing, payment, and feature fields', async () => {
    const allowed = await createPolicy({
      entitlementLimit: null,
      used: 12,
    }).policy.assertCanIncreaseActiveStudentSeats({
      schoolId: 'school-1',
      reason: 'enrollment_create',
    });

    const { policy } = createPolicy({ entitlementLimit: 1, used: 1 });
    let blockedDetails: Record<string, unknown> | undefined;
    try {
      await policy.assertCanIncreaseActiveStudentSeats({
        schoolId: 'school-1',
        reason: 'enrollment_create',
      });
    } catch (error) {
      blockedDetails =
        error instanceof PlatformEntitlementStudentSeatLimitExceededException
          ? error.details
          : undefined;
    }

    const serialized = JSON.stringify({ allowed, blockedDetails });
    for (const forbidden of [
      'billing',
      'payment',
      'invoice',
      'plan',
      'feature',
      'guardian',
      'studentName',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe('StudentSeatLimitPolicyRepository', () => {
  it('uses the active_students calculation for current school usage', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { studentId: 'student-1' },
        { studentId: 'student-2' },
      ]);
    const repository = new StudentSeatLimitPolicyRepository({
      scoped: {
        enrollment: {
          findMany,
        },
      },
    } as never);

    const count = await repository.countActiveStudentSeatsForCurrentSchool();

    expect(count).toBe(2);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
      distinct: ['studentId'],
      select: { studentId: true },
    });
  });
});

function createPolicy(params: {
  entitlementLimit?: number | null;
  used: number;
  existingStudentHasSeat?: boolean;
}): {
  policy: StudentSeatLimitPolicyService;
  repository: jest.Mocked<Partial<StudentSeatLimitPolicyRepository>>;
} {
  const repository: jest.Mocked<Partial<StudentSeatLimitPolicyRepository>> = {
    findEntitlementForCurrentSchool: jest.fn().mockResolvedValue(
      params.entitlementLimit === undefined
        ? null
        : {
            id: 'entitlement-1',
            schoolId: 'school-1',
            studentSeatLimit: params.entitlementLimit,
          },
    ),
    countActiveStudentSeatsForCurrentSchool: jest
      .fn()
      .mockResolvedValue(params.used),
    hasActiveStudentSeatForCurrentSchool: jest
      .fn()
      .mockResolvedValue(params.existingStudentHasSeat ?? false),
  };

  return {
    policy: new StudentSeatLimitPolicyService(repository as never),
    repository,
  };
}

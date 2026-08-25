import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentEnrollmentPlacementConflictException } from '../domain/enrollment.exceptions';
import { StudentPlacementCapacityPolicyService } from '../domain/student-placement-capacity-policy.service';
import { EnrollmentsRepository } from '../infrastructure/enrollments.repository';

describe('StudentPlacementCapacityPolicyService', () => {
  function createPolicy(activeCount = 0) {
    const countActiveEnrollmentsInPlacement = jest
      .fn()
      .mockResolvedValue(activeCount);
    const enrollmentsRepository = {
      countActiveEnrollmentsInPlacement,
    } as unknown as EnrollmentsRepository;

    return {
      countActiveEnrollmentsInPlacement,
      policy: new StudentPlacementCapacityPolicyService(enrollmentsRepository),
    };
  }

  it('allows placement without querying when classroom capacity is unlimited', async () => {
    const { countActiveEnrollmentsInPlacement, policy } = createPolicy(100);

    await expect(
      policy.assertCanPlace({
        academicYearId: 'year-1',
        classroom: { id: 'classroom-1', capacity: null },
      }),
    ).resolves.toBeUndefined();
    expect(countActiveEnrollmentsInPlacement).not.toHaveBeenCalled();
  });

  it('allows placement below classroom capacity', async () => {
    const { countActiveEnrollmentsInPlacement, policy } = createPolicy(2);

    await expect(
      policy.assertCanPlace({
        academicYearId: 'year-1',
        classroom: { id: 'classroom-1', capacity: 5 },
      }),
    ).resolves.toBeUndefined();
    expect(countActiveEnrollmentsInPlacement).toHaveBeenCalledWith({
      academicYearId: 'year-1',
      classroomId: 'classroom-1',
      excludeEnrollmentId: undefined,
    });
  });

  it('allows placement that exactly fills the remaining capacity', async () => {
    const { policy } = createPolicy(4);

    await expect(
      policy.assertCanPlace({
        academicYearId: 'year-1',
        classroom: { id: 'classroom-1', capacity: 5 },
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects placement beyond capacity with the canonical domain error', async () => {
    const { policy } = createPolicy(5);

    await expect(
      policy.assertCanPlace({
        academicYearId: 'year-1',
        classroom: { id: 'classroom-1', capacity: 5 },
      }),
    ).rejects.toMatchObject({
      code: 'students.enrollment.placement_conflict',
      details: {
        academicYearId: 'year-1',
        classroomId: 'classroom-1',
        capacity: 5,
        activeCount: 5,
        incrementBy: 1,
        projectedActiveCount: 6,
      },
    });
  });

  it('supports increments greater than one', async () => {
    const { policy } = createPolicy(2);

    await expect(
      policy.assertCanPlace({
        academicYearId: 'year-1',
        classroom: { id: 'classroom-1', capacity: 5 },
        incrementBy: 3,
      }),
    ).resolves.toBeUndefined();

    await expect(
      policy.assertCanPlace({
        academicYearId: 'year-1',
        classroom: { id: 'classroom-1', capacity: 4 },
        incrementBy: 3,
      }),
    ).rejects.toBeInstanceOf(StudentEnrollmentPlacementConflictException);
  });

  it('preserves the explicitly excluded enrollment in the scoped count', async () => {
    const { countActiveEnrollmentsInPlacement, policy } = createPolicy(3);

    await policy.assertCanPlace({
      academicYearId: 'year-1',
      classroom: { id: 'classroom-1', capacity: 4 },
      excludeEnrollmentId: 'enrollment-1',
    });

    expect(countActiveEnrollmentsInPlacement).toHaveBeenCalledWith({
      academicYearId: 'year-1',
      classroomId: 'classroom-1',
      excludeEnrollmentId: 'enrollment-1',
    });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid placement increment %p without querying',
    async (incrementBy) => {
      const { countActiveEnrollmentsInPlacement, policy } = createPolicy();

      await expect(
        policy.assertCanPlace({
          academicYearId: 'year-1',
          classroom: { id: 'classroom-1', capacity: 5 },
          incrementBy,
        }),
      ).rejects.toBeInstanceOf(ValidationDomainException);
      expect(countActiveEnrollmentsInPlacement).not.toHaveBeenCalled();
    },
  );
});

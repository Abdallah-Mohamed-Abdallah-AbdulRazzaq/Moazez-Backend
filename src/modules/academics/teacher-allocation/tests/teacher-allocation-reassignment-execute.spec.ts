/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/unbound-method -- focused Jest transaction doubles intentionally expose callback values and detached mock methods. */
import {
  CommunicationAnnouncementStatus,
  HomeworkAssignmentStatus,
  LessonPlanStatus,
  MembershipStatus,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  TeacherEmploymentStatus,
  TeacherGender,
  TimetableEntryStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { buildTeacherAnnouncementMetadata } from '../../../communication/domain/teacher-app-announcement-metadata';
import { ReassignTeacherAllocationUseCase } from '../application/reassign-teacher-allocation.use-case';
import { TeacherAllocationReassignmentImpactService } from '../application/teacher-allocation-reassignment-impact.service';
import type {
  TeacherAllocationReassignmentTransactionContext,
  TeacherAllocationReassignmentUnitOfWork,
} from '../application/teacher-allocation-reassignment.unit-of-work';
import { computeTeacherAllocationReassignmentFingerprint } from '../domain/teacher-allocation-reassignment-fingerprint';
import type { TeacherAllocationReassignmentSnapshot } from '../infrastructure/teacher-allocation-reassignment-read.repository';

const schoolId = '10000000-0000-4000-8000-000000000001';
const organizationId = '10000000-0000-4000-8000-000000000002';
const actorId = '10000000-0000-4000-8000-000000000003';
const allocationId = '10000000-0000-4000-8000-000000000004';
const currentTeacherId = '10000000-0000-4000-8000-000000000005';
const targetTeacherId = '10000000-0000-4000-8000-000000000006';
const subjectId = '10000000-0000-4000-8000-000000000007';
const classroomId = '10000000-0000-4000-8000-000000000008';
const termId = '10000000-0000-4000-8000-000000000009';
const academicYearId = '10000000-0000-4000-8000-000000000010';
const now = new Date('2026-09-20T00:00:00.000Z');

describe('ReassignTeacherAllocationUseCase', () => {
  const impactService = new TeacherAllocationReassignmentImpactService();

  it('hands off every operational status, preserves history, and writes one safe audit', async () => {
    const snapshot = buildSnapshot({ withAllStatuses: true });
    const fixture = createFixture(snapshot);

    const result = await withScope(() =>
      fixture.useCase.execute(allocationId, {
        newTeacherUserId: targetTeacherId,
        impactFingerprint: fingerprint(snapshot),
        reasonCode: 'teacher_replacement',
      }),
    );

    expect(fixture.order).toEqual([
      'lock',
      'snapshot',
      'timetable',
      'lessonPlans',
      'homework',
      'allocation',
      'audit',
    ]);
    expect(result).toEqual({
      allocation: { id: allocationId, teacherUserId: targetTeacherId },
      previousTeacherUserId: currentTeacherId,
      newTeacherUserId: targetTeacherId,
      transferred: {
        timetableEntries: 2,
        lessonPlans: 2,
        homeworkAssignments: 3,
      },
      preservedHistorical: {
        cancelledTimetableEntries: 1,
        archivedLessonPlans: 1,
        cancelledOrArchivedHomeworkAssignments: 2,
        completedOrCancelledReinforcementTasks: 0,
        publishedArchivedOrCancelledAnnouncements: 0,
      },
    });
    expect(fixture.context.audit.writeSuccessful).toHaveBeenCalledTimes(1);
    expect(fixture.context.audit.writeSuccessful).toHaveBeenCalledWith({
      actorId,
      userType: UserType.SCHOOL_USER,
      organizationId,
      schoolId,
      allocationId,
      previousTeacherUserId: currentTeacherId,
      newTeacherUserId: targetTeacherId,
      reasonCode: 'teacher_replacement',
      transferred: {
        timetableEntries: 2,
        lessonPlans: 2,
        homeworkAssignments: 3,
      },
    });
  });

  it('checks the current fingerprint before reporting newly introduced blockers', async () => {
    const previewSnapshot = buildSnapshot();
    const currentSnapshot = buildSnapshot();
    currentSnapshot.duplicateTargetAllocationId =
      '20000000-0000-4000-8000-000000000001';
    const fixture = createFixture(currentSnapshot);

    await expect(
      withScope(() =>
        fixture.useCase.execute(allocationId, {
          newTeacherUserId: targetTeacherId,
          impactFingerprint: fingerprint(previewSnapshot),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'academics.allocation.reassignment_stale_preview',
    });
    expectNoWrites(fixture.context);
  });

  it('independently blocks execution when the confirmed fingerprint describes blocked state', async () => {
    const snapshot = buildSnapshot();
    snapshot.duplicateTargetAllocationId =
      '20000000-0000-4000-8000-000000000001';
    const fixture = createFixture(snapshot);

    await expect(
      withScope(() =>
        fixture.useCase.execute(allocationId, {
          newTeacherUserId: targetTeacherId,
          impactFingerprint: fingerprint(snapshot),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'academics.allocation.reassignment_blocked',
      details: {
        blockers: [
          {
            domain: 'allocation',
            code: 'target_already_allocated',
            count: 1,
          },
        ],
      },
    });
    expectNoWrites(fixture.context);
  });

  it('treats target lifecycle movement after Preview as stale before eligibility rejection', async () => {
    const previewSnapshot = buildSnapshot();
    const currentSnapshot = buildSnapshot();
    if (!currentSnapshot.target) throw new Error('Expected target fixture');
    currentSnapshot.target.status = UserStatus.SUSPENDED;
    const fixture = createFixture(currentSnapshot);

    await expect(
      withScope(() =>
        fixture.useCase.execute(allocationId, {
          newTeacherUserId: targetTeacherId,
          impactFingerprint: fingerprint(previewSnapshot),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'academics.allocation.reassignment_stale_preview',
    });
    expectNoWrites(fixture.context);
  });

  it.each([
    ['an active Reinforcement task', addActiveReinforcementTask],
    [
      'a DRAFT Teacher App announcement',
      (snapshot: TeacherAllocationReassignmentSnapshot) =>
        addTeacherAnnouncement(snapshot, CommunicationAnnouncementStatus.DRAFT),
    ],
    [
      'a SCHEDULED Teacher App announcement',
      (snapshot: TeacherAllocationReassignmentSnapshot) =>
        addTeacherAnnouncement(
          snapshot,
          CommunicationAnnouncementStatus.SCHEDULED,
        ),
    ],
    ['a target Teacher timetable collision', addTargetTimetableConflict],
  ])('rejects %s introduced after Preview as stale', async (_, mutate) => {
    const previewSnapshot = buildSnapshot();
    const currentSnapshot = buildSnapshot();
    mutate(currentSnapshot);
    const fixture = createFixture(currentSnapshot);

    await expect(
      withScope(() =>
        fixture.useCase.execute(allocationId, {
          newTeacherUserId: targetTeacherId,
          impactFingerprint: fingerprint(previewSnapshot),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'academics.allocation.reassignment_stale_preview',
    });
    expectNoWrites(fixture.context);
  });

  it.each([
    [
      'the current Teacher',
      'target_is_current_teacher',
      makeTargetCurrentTeacher,
    ],
    ['an exact target allocation', 'target_already_allocated', addDuplicate],
    [
      'a target Teacher timetable conflict',
      'target_teacher_conflict',
      addTargetTimetableConflict,
    ],
    [
      'an active Reinforcement task',
      'active_reinforcement_tasks',
      addActiveReinforcementTask,
    ],
    [
      'a DRAFT Teacher App announcement',
      'mutable_teacher_announcements',
      (snapshot: TeacherAllocationReassignmentSnapshot) =>
        addTeacherAnnouncement(snapshot, CommunicationAnnouncementStatus.DRAFT),
    ],
    [
      'a SCHEDULED Teacher App announcement',
      'mutable_teacher_announcements',
      (snapshot: TeacherAllocationReassignmentSnapshot) =>
        addTeacherAnnouncement(
          snapshot,
          CommunicationAnnouncementStatus.SCHEDULED,
        ),
    ],
  ])(
    'independently rejects blocked execution for %s',
    async (_, blockerCode, mutate) => {
      const snapshot = buildSnapshot();
      mutate(snapshot);
      const fixture = createFixture(snapshot);

      await expect(
        withScope(() =>
          fixture.useCase.execute(allocationId, {
            newTeacherUserId: snapshot.target?.id ?? targetTeacherId,
            impactFingerprint: fingerprint(snapshot),
          }),
        ),
      ).rejects.toMatchObject({
        code: 'academics.allocation.reassignment_blocked',
        details: {
          blockers: expect.arrayContaining([
            expect.objectContaining({ code: blockerCode }),
          ]),
        },
      });
      expectNoWrites(fixture.context);
    },
  );

  it('rejects a closed term before mutation', async () => {
    const snapshot = buildSnapshot();
    snapshot.allocation.term.isActive = false;
    const fixture = createFixture(snapshot);

    await expect(
      withScope(() =>
        fixture.useCase.execute(allocationId, {
          newTeacherUserId: targetTeacherId,
          impactFingerprint: fingerprint(snapshot),
        }),
      ),
    ).rejects.toMatchObject({ code: 'academics.allocation.closed_term' });
    expectNoWrites(fixture.context);
  });

  it('rejects an ineligible target using the confirmed current fingerprint', async () => {
    const snapshot = buildSnapshot();
    if (!snapshot.target) throw new Error('Expected target fixture');
    snapshot.target.status = UserStatus.SUSPENDED;
    const fixture = createFixture(snapshot);

    await expect(
      withScope(() =>
        fixture.useCase.execute(allocationId, {
          newTeacherUserId: targetTeacherId,
          impactFingerprint: fingerprint(snapshot),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'academics.allocation.reassignment_target_ineligible',
      details: { reasonCode: 'account_status_ineligible' },
    });
    expectNoWrites(fixture.context);
  });

  it('rejects a cross-school target as not found before mutation', async () => {
    const snapshot = buildSnapshot();
    snapshot.target = null;
    const fixture = createFixture(snapshot);

    await expect(
      withScope(() =>
        fixture.useCase.execute(allocationId, {
          newTeacherUserId: targetTeacherId,
          impactFingerprint: 'a'.repeat(64),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'academics.allocation.reassignment_target_not_found',
      httpStatus: 404,
    });
    expectNoWrites(fixture.context);
  });

  it('rolls back through the unit of work contract when an expected mutation count moves', async () => {
    const snapshot = buildSnapshot({ withAllStatuses: true });
    const fixture = createFixture(snapshot);
    jest.mocked(fixture.context.timetable.handoff).mockResolvedValueOnce(1);

    await expect(
      withScope(() =>
        fixture.useCase.execute(allocationId, {
          newTeacherUserId: targetTeacherId,
          impactFingerprint: fingerprint(snapshot),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'academics.allocation.reassignment_concurrent_change',
    });
    expect(fixture.context.lessonPlans.handoff).not.toHaveBeenCalled();
    expect(fixture.context.homework.handoff).not.toHaveBeenCalled();
    expect(fixture.context.allocation.handoff).not.toHaveBeenCalled();
    expect(fixture.context.audit.writeSuccessful).not.toHaveBeenCalled();
  });

  it.each([
    { code: 'P2034' },
    { code: 'P2010', meta: { code: '40001' } },
    { code: 'P2002', meta: { target: ['teacher_user_id'] } },
  ])(
    'maps $code to the governed concurrent-change response without retry',
    async (error) => {
      const execute = jest.fn().mockRejectedValue(error);
      const useCase = new ReassignTeacherAllocationUseCase(
        { execute } as unknown as TeacherAllocationReassignmentUnitOfWork,
        impactService,
      );

      await expect(
        withScope(() =>
          useCase.execute(allocationId, {
            newTeacherUserId: targetTeacherId,
            impactFingerprint: 'a'.repeat(64),
          }),
        ),
      ).rejects.toMatchObject({
        code: 'academics.allocation.reassignment_concurrent_change',
      });
      expect(execute).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['P2024', 'P2028'])(
    'does not misclassify %s infrastructure failures',
    async (code) => {
      const error = { code };
      const useCase = new ReassignTeacherAllocationUseCase(
        {
          execute: jest.fn().mockRejectedValue(error),
        } as unknown as TeacherAllocationReassignmentUnitOfWork,
        impactService,
      );

      await expect(
        withScope(() =>
          useCase.execute(allocationId, {
            newTeacherUserId: targetTeacherId,
            impactFingerprint: 'a'.repeat(64),
          }),
        ),
      ).rejects.toBe(error);
    },
  );

  it('does not leak a cross-school allocation when the scoped lock finds no row', async () => {
    const fixture = createFixture(buildSnapshot());
    jest.mocked(fixture.context.allocation.lock).mockResolvedValueOnce(false);

    await expect(
      withScope(() =>
        fixture.useCase.execute(allocationId, {
          newTeacherUserId: targetTeacherId,
          impactFingerprint: 'a'.repeat(64),
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
    expect(fixture.context.snapshot.load).not.toHaveBeenCalled();
    expectNoWrites(fixture.context);
  });

  function fingerprint(snapshot: TeacherAllocationReassignmentSnapshot) {
    return computeTeacherAllocationReassignmentFingerprint(
      impactService.analyze(snapshot).fingerprintMaterial,
    );
  }
});

function createFixture(snapshot: TeacherAllocationReassignmentSnapshot) {
  const impactService = new TeacherAllocationReassignmentImpactService();
  const analysis = snapshot.target ? impactService.analyze(snapshot) : null;
  const order: string[] = [];
  const context: TeacherAllocationReassignmentTransactionContext = {
    allocation: {
      lock: jest.fn(async () => {
        order.push('lock');
        return true;
      }),
      handoff: jest.fn(async () => {
        order.push('allocation');
        return 1;
      }),
    },
    snapshot: {
      load: jest.fn(async () => {
        order.push('snapshot');
        return snapshot;
      }),
    },
    timetable: {
      handoff: jest.fn(async () => {
        order.push('timetable');
        return (
          (analysis?.impact.timetable.draft ?? 0) +
          (analysis?.impact.timetable.active ?? 0)
        );
      }),
    },
    lessonPlans: {
      handoff: jest.fn(async () => {
        order.push('lessonPlans');
        return (
          (analysis?.impact.lessonPlans.draft ?? 0) +
          (analysis?.impact.lessonPlans.active ?? 0)
        );
      }),
    },
    homework: {
      handoff: jest.fn(async () => {
        order.push('homework');
        return (
          (analysis?.impact.homework.draft ?? 0) +
          (analysis?.impact.homework.published ?? 0) +
          (analysis?.impact.homework.closed ?? 0)
        );
      }),
    },
    audit: {
      writeSuccessful: jest.fn(async () => {
        order.push('audit');
      }),
    },
  };
  const unitOfWork = {
    execute: jest.fn((callback) => callback(context)),
  } as unknown as TeacherAllocationReassignmentUnitOfWork;
  return {
    context,
    order,
    useCase: new ReassignTeacherAllocationUseCase(unitOfWork, impactService),
  };
}

function expectNoWrites(
  context: TeacherAllocationReassignmentTransactionContext,
): void {
  expect(context.timetable.handoff).not.toHaveBeenCalled();
  expect(context.lessonPlans.handoff).not.toHaveBeenCalled();
  expect(context.homework.handoff).not.toHaveBeenCalled();
  expect(context.allocation.handoff).not.toHaveBeenCalled();
  expect(context.audit.writeSuccessful).not.toHaveBeenCalled();
}

async function withScope<T>(testFn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: actorId, userType: UserType.SCHOOL_USER });
    setActiveMembership({
      membershipId: '10000000-0000-4000-8000-000000000011',
      organizationId,
      schoolId,
      roleId: '10000000-0000-4000-8000-000000000012',
      permissions: ['academics.structure.manage'],
    });
    return testFn();
  });
}

function buildSnapshot(
  options: { withAllStatuses?: boolean } = {},
): TeacherAllocationReassignmentSnapshot {
  const target = {
    id: targetTeacherId,
    firstName: 'Target',
    lastName: 'Teacher',
    userType: UserType.TEACHER,
    status: UserStatus.ACTIVE,
    deletedAt: null,
    updatedAt: now,
    memberships: [
      {
        id: '20000000-0000-4000-8000-000000000002',
        userId: targetTeacherId,
        organizationId,
        schoolId,
        roleId: '20000000-0000-4000-8000-000000000003',
        userType: UserType.TEACHER,
        status: MembershipStatus.ACTIVE,
        startedAt: now,
        endedAt: null,
        deletedAt: null,
        updatedAt: now,
        role: {
          id: '20000000-0000-4000-8000-000000000003',
          key: 'teacher',
          schoolId: null,
          deletedAt: null,
        },
      },
    ],
    teacherProfiles: [
      {
        id: '20000000-0000-4000-8000-000000000004',
        schoolId,
        userId: targetTeacherId,
        teacherCode: 'T-002',
        firstNameAr: 'معلم',
        lastNameAr: 'مستهدف',
        firstNameEn: 'Target',
        lastNameEn: 'Teacher',
        gender: TeacherGender.MALE,
        employmentStatus: TeacherEmploymentStatus.ACTIVE,
        deletedAt: null,
        updatedAt: now,
      },
    ],
  };

  return {
    allocation: {
      id: allocationId,
      schoolId,
      teacherUserId: currentTeacherId,
      subjectId,
      classroomId,
      termId,
      createdAt: now,
      updatedAt: now,
      teacherUser: {
        id: currentTeacherId,
        firstName: 'Current',
        lastName: 'Teacher',
      },
      term: {
        id: termId,
        schoolId,
        nameAr: 'الفصل',
        nameEn: 'Term',
        startDate: now,
        endDate: now,
        isActive: true,
        deletedAt: null,
        academicYearId,
        academicYear: { isActive: true, deletedAt: null },
      },
    },
    target,
    duplicateTargetAllocationId: null,
    timetableEntries: options.withAllStatuses
      ? Object.values(TimetableEntryStatus).map((status, index) => ({
          id: `30000000-0000-4000-8000-00000000000${index}`,
          schoolId,
          termId,
          timetableConfigId: '30000000-0000-4000-8000-000000000010',
          teacherSubjectAllocationId: allocationId,
          classroomId,
          teacherUserId: currentTeacherId,
          roomId: null,
          dayOfWeek: index + 1,
          periodId: `30000000-0000-4000-8000-00000000002${index}`,
          status,
          updatedAt: now,
          period: {
            startTime: `0${index + 7}:00`,
            endTime: `0${index + 8}:00`,
            updatedAt: now,
          },
          timetableConfig: {
            status: 'ACTIVE' as const,
            updatedAt: now,
            publications: [],
          },
        }))
      : [],
    lessonPlans: options.withAllStatuses
      ? Object.values(LessonPlanStatus).map((status, index) => ({
          id: `40000000-0000-4000-8000-00000000000${index}`,
          status,
          teacherUserId: currentTeacherId,
          createdByUserId: currentTeacherId,
          updatedByUserId: null,
          updatedAt: now,
        }))
      : [],
    homeworkAssignments: options.withAllStatuses
      ? Object.values(HomeworkAssignmentStatus).map((status, index) => ({
          id: `50000000-0000-4000-8000-00000000000${index}`,
          status,
          teacherUserId: currentTeacherId,
          createdByUserId: currentTeacherId,
          publishedByUserId: currentTeacherId,
          updatedAt: now,
        }))
      : [],
    reinforcementTasks: [],
    announcements: [],
  };
}

function addDuplicate(snapshot: TeacherAllocationReassignmentSnapshot): void {
  snapshot.duplicateTargetAllocationId = '60000000-0000-4000-8000-000000000001';
}

function makeTargetCurrentTeacher(
  snapshot: TeacherAllocationReassignmentSnapshot,
): void {
  if (!snapshot.target) throw new Error('Expected target fixture');
  snapshot.target.id = currentTeacherId;
  snapshot.target.memberships = snapshot.target.memberships.map(
    (membership) => ({ ...membership, userId: currentTeacherId }),
  );
  snapshot.target.teacherProfiles = snapshot.target.teacherProfiles.map(
    (profile) => ({ ...profile, userId: currentTeacherId }),
  );
}

function addTargetTimetableConflict(
  snapshot: TeacherAllocationReassignmentSnapshot,
): void {
  snapshot.timetableEntries.push(
    timetableEntry({
      id: '61000000-0000-4000-8000-000000000001',
      allocationId,
      teacherUserId: currentTeacherId,
      classroomId,
      startTime: '09:00',
      endTime: '10:00',
    }),
    timetableEntry({
      id: '61000000-0000-4000-8000-000000000002',
      allocationId: '61000000-0000-4000-8000-000000000003',
      teacherUserId: targetTeacherId,
      classroomId: '61000000-0000-4000-8000-000000000004',
      startTime: '09:30',
      endTime: '10:30',
    }),
  );
}

function timetableEntry(input: {
  id: string;
  allocationId: string;
  teacherUserId: string;
  classroomId: string;
  startTime: string;
  endTime: string;
}): TeacherAllocationReassignmentSnapshot['timetableEntries'][number] {
  return {
    id: input.id,
    schoolId,
    termId,
    timetableConfigId: '61000000-0000-4000-8000-000000000005',
    teacherSubjectAllocationId: input.allocationId,
    classroomId: input.classroomId,
    teacherUserId: input.teacherUserId,
    roomId: null,
    dayOfWeek: 1,
    periodId: input.id,
    status: TimetableEntryStatus.ACTIVE,
    updatedAt: now,
    period: {
      startTime: input.startTime,
      endTime: input.endTime,
      updatedAt: now,
    },
    timetableConfig: {
      status: 'ACTIVE',
      updatedAt: now,
      publications: [],
    },
  };
}

function addActiveReinforcementTask(
  snapshot: TeacherAllocationReassignmentSnapshot,
): void {
  snapshot.reinforcementTasks.push({
    id: '62000000-0000-4000-8000-000000000001',
    academicYearId,
    termId,
    subjectId,
    assignedById: currentTeacherId,
    createdById: currentTeacherId,
    status: ReinforcementTaskStatus.IN_PROGRESS,
    updatedAt: now,
    assignments: [
      {
        id: '62000000-0000-4000-8000-000000000002',
        status: ReinforcementTaskStatus.IN_PROGRESS,
        updatedAt: now,
        enrollment: {
          academicYearId,
          termId,
          classroomId,
          status: StudentEnrollmentStatus.ACTIVE,
          deletedAt: null,
          updatedAt: now,
          student: {
            status: StudentStatus.ACTIVE,
            deletedAt: null,
            updatedAt: now,
          },
        },
      },
    ],
  });
}

function addTeacherAnnouncement(
  snapshot: TeacherAllocationReassignmentSnapshot,
  status: CommunicationAnnouncementStatus,
): void {
  snapshot.announcements.push({
    id: '63000000-0000-4000-8000-000000000001',
    status,
    createdById: currentTeacherId,
    metadata: buildTeacherAnnouncementMetadata({
      target: {
        type: 'classroom',
        classId: allocationId,
        classroomId,
        label: 'Class A',
      },
      audience: 'students',
    }),
    updatedAt: now,
  });
}

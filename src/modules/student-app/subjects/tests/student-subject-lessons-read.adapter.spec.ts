/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Prisma mock call tuples intentionally expose untyped query arguments. */
import {
  CurriculumStatus,
  LessonPlanItemStatus,
  LessonPlanStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentSubjectLessonsReadAdapter } from '../infrastructure/student-subject-lessons-read.adapter';

describe('StudentSubjectLessonsReadAdapter eligibility', () => {
  it('accepts the allocation-only branch without selecting one allocation', async () => {
    const { adapter, mocks } = createAdapter();
    mocks.allocation.count.mockResolvedValue(1);
    mocks.plan.count.mockResolvedValue(0);

    await expect(
      adapter.resolveEligibleSubject({
        context: contextFixture(),
        subjectId: 'subject',
      }),
    ).resolves.toEqual({
      termStartDate: new Date('2026-09-01T00:00:00.000Z'),
      termEndDate: new Date('2026-12-31T00:00:00.000Z'),
    });
    expect(mocks.allocation.findFirst).not.toHaveBeenCalled();
    expect(mocks.allocation.findMany).not.toHaveBeenCalled();
  });

  it('accepts a visible-plan-only Subject without a current allocation', async () => {
    const { adapter, mocks } = createAdapter();
    mocks.allocation.count.mockResolvedValue(0);
    mocks.plan.count.mockResolvedValue(1);

    await expect(
      adapter.resolveEligibleSubject({
        context: contextFixture(),
        subjectId: 'subject',
      }),
    ).resolves.not.toBeNull();

    const planWhere = mocks.plan.count.mock.calls[0][0].where;
    expect(planWhere).toMatchObject({
      schoolId: 'school',
      academicYearId: 'year',
      termId: 'term',
      classroomId: 'classroom',
      subjectId: 'subject',
      status: LessonPlanStatus.ACTIVE,
      deletedAt: null,
      term: {
        is: { schoolId: 'school', academicYearId: 'year', deletedAt: null },
      },
      subject: {
        is: { schoolId: 'school', isActive: true, deletedAt: null },
      },
      curriculum: {
        is: {
          schoolId: 'school',
          academicYearId: 'year',
          termId: 'term',
          status: CurriculumStatus.ACTIVE,
          deletedAt: null,
        },
      },
    });
    expect(planWhere).not.toHaveProperty('teacherSubjectAllocation');
    expect(planWhere.classroom.is.section.is.grade.is.stage.is).toEqual({
      schoolId: 'school',
      deletedAt: null,
    });
  });

  it('rejects neither eligibility branch and missing/non-readable Terms safely', async () => {
    const neither = createAdapter();
    neither.mocks.allocation.count.mockResolvedValue(0);
    neither.mocks.plan.count.mockResolvedValue(0);
    await expect(
      neither.adapter.resolveEligibleSubject({
        context: contextFixture(),
        subjectId: 'subject',
      }),
    ).resolves.toBeNull();

    const missingTerm = createAdapter();
    missingTerm.mocks.term.findFirst.mockResolvedValue(null);
    await expect(
      missingTerm.adapter.resolveEligibleSubject({
        context: contextFixture(),
        subjectId: 'subject',
      }),
    ).resolves.toBeNull();
    expect(missingTerm.mocks.subject.findFirst).not.toHaveBeenCalled();

    const nullTerm = createAdapter();
    await expect(
      nullTerm.adapter.resolveEligibleSubject({
        context: contextFixture(null),
        subjectId: 'subject',
      }),
    ).resolves.toBeNull();
    expect(nullTerm.mocks.term.findFirst).not.toHaveBeenCalled();
  });

  it('requires an active non-deleted same-school Subject and an exact Term without isActive', async () => {
    const { adapter, mocks } = createAdapter();
    mocks.subject.findFirst.mockResolvedValue(null);

    await adapter.resolveEligibleSubject({
      context: contextFixture(),
      subjectId: 'subject',
    });

    expect(mocks.term.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'term',
        schoolId: 'school',
        academicYearId: 'year',
        deletedAt: null,
      },
      select: { startDate: true, endDate: true },
    });
    expect(mocks.term.findFirst.mock.calls[0][0].where).not.toHaveProperty(
      'isActive',
    );
    expect(mocks.subject.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'subject',
        schoolId: 'school',
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
  });
});

describe('StudentSubjectLessonsReadAdapter listing and cursor', () => {
  it('reproduces Student Lesson visibility, adds Subject/date/status, and selects minimal content fields', async () => {
    const { adapter, mocks } = createAdapter();
    mocks.item.findMany.mockResolvedValue([]);

    await adapter.listVisibleItems({
      context: contextFixture(),
      subjectId: 'subject',
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-12-31T00:00:00.000Z'),
      status: LessonPlanItemStatus.DONE,
      cursor: null,
      take: 51,
    });

    const query = mocks.item.findMany.mock.calls[0][0];
    expect(query.take).toBe(51);
    expect(query.where.AND[0]).toMatchObject({
      schoolId: 'school',
      deletedAt: null,
      lessonPlan: {
        is: {
          schoolId: 'school',
          academicYearId: 'year',
          termId: 'term',
          classroomId: 'classroom',
          subjectId: 'subject',
          status: LessonPlanStatus.ACTIVE,
          deletedAt: null,
        },
      },
      curriculum: {
        is: {
          schoolId: 'school',
          academicYearId: 'year',
          termId: 'term',
          status: CurriculumStatus.ACTIVE,
          deletedAt: null,
        },
      },
      unit: { is: { schoolId: 'school', deletedAt: null } },
      lesson: { is: { schoolId: 'school', deletedAt: null } },
    });
    expect(query.where.AND[1]).toEqual({
      plannedDate: {
        not: null,
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lte: new Date('2026-12-31T00:00:00.000Z'),
      },
    });
    expect(query.where.AND[2]).toEqual({ status: LessonPlanItemStatus.DONE });
    expect(query.where.AND[0].lessonPlan.is).not.toHaveProperty(
      'teacherSubjectAllocation',
    );
    expect(query.select.lesson.select.contentItems).toMatchObject({
      where: {
        deletedAt: null,
        curriculum: {
          is: { deletedAt: null, status: CurriculumStatus.ACTIVE },
        },
        unit: { is: { deletedAt: null } },
      },
      select: { type: true, isRequired: true },
    });
    expect(query.select.lesson.select.contentItems.select).toEqual({
      type: true,
      isRequired: true,
    });
  });

  it('orders by the complete database tuple with null periods naturally last', async () => {
    const { adapter, mocks } = createAdapter();
    mocks.item.findMany.mockResolvedValue([]);

    await adapter.listVisibleItems(baseListParams());

    expect(mocks.item.findMany.mock.calls[0][0].orderBy).toEqual([
      { plannedDate: { sort: 'asc', nulls: 'last' } },
      { timetableEntry: { period: { periodIndex: 'asc' } } },
      { sortOrder: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('builds numeric-period continuation including later numeric and null periods, sortOrder, and id ties', async () => {
    const { adapter, mocks } = createAdapter();
    mocks.item.findMany.mockResolvedValue([]);

    await adapter.listVisibleItems({
      ...baseListParams(),
      cursor: {
        plannedDate: new Date('2026-09-14T00:00:00.000Z'),
        periodIndex: 2,
        sortOrder: 3,
        itemId: 'item',
      },
    });

    const cursorWhere = mocks.item.findMany.mock.calls[0][0].where.AND[2];
    expect(cursorWhere.OR).toHaveLength(5);
    expect(cursorWhere.OR).toEqual(
      expect.arrayContaining([
        { plannedDate: { gt: new Date('2026-09-14T00:00:00.000Z') } },
        {
          plannedDate: new Date('2026-09-14T00:00:00.000Z'),
          timetableEntryId: null,
        },
        expect.objectContaining({
          plannedDate: new Date('2026-09-14T00:00:00.000Z'),
          sortOrder: { gt: 3 },
        }),
        expect.objectContaining({
          plannedDate: new Date('2026-09-14T00:00:00.000Z'),
          sortOrder: 3,
          id: { gt: 'item' },
        }),
      ]),
    );
    expect(JSON.stringify(cursorWhere)).toContain('"gt":2');
  });

  it('builds null-period continuation with only later dates and null-period tuple ties', async () => {
    const { adapter, mocks } = createAdapter();
    mocks.item.findMany.mockResolvedValue([]);

    await adapter.listVisibleItems({
      ...baseListParams(),
      cursor: {
        plannedDate: new Date('2026-09-14T00:00:00.000Z'),
        periodIndex: null,
        sortOrder: 3,
        itemId: 'item',
      },
    });

    const cursorWhere = mocks.item.findMany.mock.calls[0][0].where.AND[2];
    expect(cursorWhere.OR).toHaveLength(2);
    expect(cursorWhere.OR[1]).toMatchObject({
      plannedDate: new Date('2026-09-14T00:00:00.000Z'),
      timetableEntryId: null,
      OR: [{ sortOrder: { gt: 3 } }, { sortOrder: 3, id: { gt: 'item' } }],
    });
  });

  it('performs read-only scoped queries with no platform bypass', async () => {
    const { adapter, mocks, platformBypass } = createAdapter();
    mocks.allocation.count.mockResolvedValue(1);
    mocks.plan.count.mockResolvedValue(0);
    mocks.item.findMany.mockResolvedValue([]);

    await adapter.resolveEligibleSubject({
      context: contextFixture(),
      subjectId: 'subject',
    });
    await adapter.listVisibleItems(baseListParams());

    for (const model of Object.values(mocks)) {
      expect(model.create).not.toHaveBeenCalled();
      expect(model.update).not.toHaveBeenCalled();
      expect(model.delete).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function baseListParams() {
  return {
    context: contextFixture(),
    subjectId: 'subject',
    from: new Date('2026-09-01T00:00:00.000Z'),
    to: new Date('2026-12-31T00:00:00.000Z'),
    status: null,
    cursor: null,
    take: 21,
  };
}

function contextFixture(termId: string | null = 'term'): StudentAppContext {
  return {
    studentUserId: 'student-user',
    studentId: 'student',
    schoolId: 'school',
    organizationId: 'organization',
    membershipId: 'membership',
    roleId: 'role',
    permissions: [],
    enrollmentId: 'enrollment',
    classroomId: 'classroom',
    academicYearId: 'year',
    termId,
  };
}

function modelMocks() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function createAdapter() {
  const mocks = {
    term: modelMocks(),
    subject: modelMocks(),
    allocation: modelMocks(),
    plan: modelMocks(),
    item: modelMocks(),
  };
  mocks.term.findFirst.mockResolvedValue({
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
  });
  mocks.subject.findFirst.mockResolvedValue({ id: 'subject' });
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      term: mocks.term,
      subject: mocks.subject,
      teacherSubjectAllocation: mocks.allocation,
      lessonPlan: mocks.plan,
      lessonPlanItem: mocks.item,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentSubjectLessonsReadAdapter(prisma),
    mocks,
    platformBypass,
  };
}

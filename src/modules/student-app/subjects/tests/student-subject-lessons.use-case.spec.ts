/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method -- Focused Jest mocks intentionally assert recorded use-case calls and thrown domain errors. */
import { LessonContentItemType, LessonPlanItemStatus } from '@prisma/client';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import {
  decodeStudentSubjectLessonsCursor,
  encodeStudentSubjectLessonsCursor,
  ListStudentSubjectLessonsUseCase,
  type StudentSubjectLessonsCursorIdentity,
  type StudentSubjectLessonsCursorPayload,
} from '../application/list-student-subject-lessons.use-case';
import type { StudentSubjectLessonsQueryDto } from '../dto/student-subject-lessons.dto';
import {
  StudentSubjectLessonsReadAdapter,
  type StudentSubjectLessonItemRecord,
} from '../infrastructure/student-subject-lessons-read.adapter';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const TERM_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

describe('ListStudentSubjectLessonsUseCase', () => {
  it('uses Term boundaries and the default limit', async () => {
    const { useCase, readAdapter } = createUseCase();

    const result = await useCase.execute({ subjectId: SUBJECT_ID, query: {} });

    expect(readAdapter.listVisibleItems).toHaveBeenCalledWith(
      expect.objectContaining({
        context: contextFixture(),
        subjectId: SUBJECT_ID,
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-12-31T00:00:00.000Z'),
        status: null,
        cursor: null,
        take: 21,
      }),
    );
    expect(result).toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
  });

  it('normalizes one-sided ranges to the opposite Term boundary', async () => {
    const { useCase, readAdapter } = createUseCase();

    await useCase.execute({
      subjectId: SUBJECT_ID,
      query: { from: '2026-09-14' },
    });
    expect(readAdapter.listVisibleItems).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: new Date('2026-09-14T00:00:00.000Z'),
        to: new Date('2026-12-31T00:00:00.000Z'),
      }),
    );

    await useCase.execute({
      subjectId: SUBJECT_ID,
      query: { to: '2026-10-20' },
    });
    expect(readAdapter.listVisibleItems).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-10-20T00:00:00.000Z'),
      }),
    );
  });

  it('accepts inclusive Term boundaries and limits 1 and 50', async () => {
    const { useCase, readAdapter } = createUseCase();

    await useCase.execute({
      subjectId: SUBJECT_ID,
      query: { from: '2026-09-01', to: '2026-12-31', limit: 1 },
    });
    expect(readAdapter.listVisibleItems).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 2 }),
    );

    await useCase.execute({
      subjectId: SUBJECT_ID,
      query: { limit: 50 },
    });
    expect(readAdapter.listVisibleItems).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 51 }),
    );
  });

  it.each([
    [{ from: '2026-02-31' }, 'from'],
    [{ from: '2026-10-02', to: '2026-10-01' }, 'from'],
    [{ from: '2026-08-31' }, 'from'],
    [{ to: '2027-01-01' }, 'to'],
    [{ limit: 0 }, 'limit'],
    [{ limit: 51 }, 'limit'],
    [{ limit: 1.5 }, 'limit'],
  ])('rejects invalid query %p safely', async (query, field) => {
    const { useCase, readAdapter } = createUseCase();

    await expect(
      useCase.execute({
        subjectId: SUBJECT_ID,
        query: query as StudentSubjectLessonsQueryDto,
      }),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      details: { field },
    });
    expect(readAdapter.listVisibleItems).not.toHaveBeenCalled();
  });

  it.each([
    ['planned', LessonPlanItemStatus.PLANNED],
    ['in_progress', LessonPlanItemStatus.IN_PROGRESS],
    ['done', LessonPlanItemStatus.DONE],
    ['skipped', LessonPlanItemStatus.SKIPPED],
    ['rescheduled', LessonPlanItemStatus.RESCHEDULED],
    ['cancelled', LessonPlanItemStatus.CANCELLED],
  ] as const)('maps status %s exactly', async (status, expected) => {
    const { useCase, readAdapter } = createUseCase();

    await useCase.execute({ subjectId: SUBJECT_ID, query: { status } });

    expect(readAdapter.listVisibleItems).toHaveBeenCalledWith(
      expect.objectContaining({ status: expected }),
    );
  });

  it('rejects an unsupported status even when called without DTO validation', async () => {
    const { useCase } = createUseCase();

    await expect(
      useCase.execute({
        subjectId: SUBJECT_ID,
        query: {
          status: 'unknown',
        } as unknown as StudentSubjectLessonsQueryDto,
      }),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      details: { field: 'status' },
    });
  });

  it('returns the same empty page for allocation-only eligibility', async () => {
    const { useCase } = createUseCase();

    await expect(
      useCase.execute({ subjectId: SUBJECT_ID, query: {} }),
    ).resolves.toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
  });

  it('throws the details-free discovery 404 for a missing Term or ineligible Subject', async () => {
    const missingTerm = createUseCase({ termId: null });
    await expect(
      missingTerm.useCase.execute({ subjectId: SUBJECT_ID, query: {} }),
    ).rejects.toMatchObject({
      code: 'learning.subject_lessons.not_found',
      httpStatus: 404,
      details: undefined,
    });
    expect(
      missingTerm.readAdapter.resolveEligibleSubject,
    ).not.toHaveBeenCalled();

    const ineligible = createUseCase();
    ineligible.readAdapter.resolveEligibleSubject.mockResolvedValue(null);
    await expect(
      ineligible.useCase.execute({ subjectId: SUBJECT_ID, query: {} }),
    ).rejects.toMatchObject({
      code: 'learning.subject_lessons.not_found',
      details: undefined,
    });
  });

  it('uses limit + 1, emits a cursor from the last returned item, and keeps the last page cursor null', async () => {
    const first = createUseCase();
    first.readAdapter.listVisibleItems.mockResolvedValue([
      itemFixture({ id: ITEM_ID }),
      itemFixture({ id: '44444444-4444-4444-8444-444444444444' }),
    ]);

    const firstPage = await first.useCase.execute({
      subjectId: SUBJECT_ID,
      query: { limit: 1 },
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.pageInfo).toEqual({
      hasNextPage: true,
      nextCursor: expect.any(String),
    });
    expect(
      decodeStudentSubjectLessonsCursor(
        firstPage.pageInfo.nextCursor!,
        cursorIdentity(),
      ),
    ).toEqual({
      plannedDate: new Date('2026-09-14T00:00:00.000Z'),
      periodIndex: 1,
      sortOrder: 3,
      itemId: ITEM_ID,
    });

    const last = createUseCase();
    last.readAdapter.listVisibleItems.mockResolvedValue([itemFixture()]);
    const lastPage = await last.useCase.execute({
      subjectId: SUBJECT_ID,
      query: { limit: 1 },
    });
    expect(lastPage.pageInfo).toEqual({
      hasNextPage: false,
      nextCursor: null,
    });
  });

  it('encodes the raw database ordering period for a context-mismatched timetable entry', async () => {
    const first = createUseCase();
    first.readAdapter.listVisibleItems.mockResolvedValue([
      itemFixture({
        id: ITEM_ID,
        timetableEntry: {
          academicYearId: 'other-year',
          termId: TERM_ID,
          classroomId: 'classroom',
          period: { id: 'period-7', label: 'Period 7', periodIndex: 7 },
        },
      }),
      itemFixture({ id: '44444444-4444-4444-8444-444444444444' }),
    ]);

    const page = await first.useCase.execute({
      subjectId: SUBJECT_ID,
      query: { limit: 1 },
    });

    expect(page.items[0].period).toEqual({ id: null, label: null });
    expect(
      decodeStudentSubjectLessonsCursor(
        page.pageInfo.nextCursor!,
        cursorIdentity(),
      ).periodIndex,
    ).toBe(7);

    const withoutEntry = createUseCase();
    withoutEntry.readAdapter.listVisibleItems.mockResolvedValue([
      itemFixture({ id: ITEM_ID, timetableEntry: null }),
      itemFixture({ id: '44444444-4444-4444-8444-444444444444' }),
    ]);
    const nullPeriodPage = await withoutEntry.useCase.execute({
      subjectId: SUBJECT_ID,
      query: { limit: 1 },
    });
    expect(
      decodeStudentSubjectLessonsCursor(
        nullPeriodPage.pageInfo.nextCursor!,
        cursorIdentity(),
      ).periodIndex,
    ).toBeNull();
  });

  it('does not accept request-selected tenant or academic context', async () => {
    const { useCase, readAdapter } = createUseCase();

    await useCase.execute({
      subjectId: SUBJECT_ID,
      query: {
        schoolId: 'request-school',
        academicYearId: 'request-year',
        termId: 'request-term',
      } as unknown as StudentSubjectLessonsQueryDto,
    });

    expect(readAdapter.resolveEligibleSubject).toHaveBeenCalledWith({
      context: contextFixture(),
      subjectId: SUBJECT_ID,
    });
    expect(readAdapter.listVisibleItems).toHaveBeenCalledWith(
      expect.objectContaining({ context: contextFixture() }),
    );
  });
});

describe('Student Subject lesson cursor', () => {
  it('roundtrips the complete version-1 payload', () => {
    const payload = cursorPayload();
    const encoded = encodeStudentSubjectLessonsCursor(payload);

    expect(
      decodeStudentSubjectLessonsCursor(encoded, cursorIdentity()),
    ).toEqual({
      plannedDate: new Date('2026-09-14T00:00:00.000Z'),
      periodIndex: 1,
      sortOrder: 3,
      itemId: ITEM_ID,
    });
  });

  it.each([
    ['malformed', 'not+base64'],
    [
      'unsupported version',
      encodeStudentSubjectLessonsCursor({
        ...cursorPayload(),
        version: 2,
      } as unknown as StudentSubjectLessonsCursorPayload),
    ],
    [
      'invalid internal shape',
      Buffer.from(JSON.stringify({ version: 1 }), 'utf8').toString('base64url'),
    ],
  ])('rejects %s cursors', (_label, cursor) => {
    expect(() =>
      decodeStudentSubjectLessonsCursor(cursor, cursorIdentity()),
    ).toThrow(expect.objectContaining({ code: 'validation.failed' }));
  });

  it.each([
    ['Subject', { subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
    ['Term', { termId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
    ['from', { from: '2026-09-02' }],
    ['to', { to: '2026-12-30' }],
    ['status', { status: 'done' as const }],
  ])('rejects a %s identity mismatch', (_label, identityOverride) => {
    const cursor = encodeStudentSubjectLessonsCursor(cursorPayload());

    expect(() =>
      decodeStudentSubjectLessonsCursor(cursor, {
        ...cursorIdentity(),
        ...identityOverride,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'validation.failed',
        details: { field: 'cursor' },
      }),
    );
  });

  it.each([
    ['periodIndex', 2_147_483_648],
    ['periodIndex', -2_147_483_649],
    ['periodIndex', Number.MAX_SAFE_INTEGER],
    ['sortOrder', 2_147_483_648],
    ['sortOrder', -2_147_483_649],
    ['sortOrder', Number.MAX_SAFE_INTEGER],
  ] as const)(
    'rejects hostile %s value %s outside signed Int32',
    (field, value) => {
      const cursor = encodeStudentSubjectLessonsCursor({
        ...cursorPayload(),
        [field]: value,
      });

      expect(() =>
        decodeStudentSubjectLessonsCursor(cursor, cursorIdentity()),
      ).toThrow(
        expect.objectContaining({
          code: 'validation.failed',
          httpStatus: 400,
          details: { field: 'cursor' },
        }),
      );
    },
  );

  it('rejects a hostile numeric cursor before the read adapter query', async () => {
    const { useCase, readAdapter } = createUseCase();
    const cursor = encodeStudentSubjectLessonsCursor({
      ...cursorPayload(),
      sortOrder: 2_147_483_648,
    });

    await expect(
      useCase.execute({ subjectId: SUBJECT_ID, query: { cursor } }),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      httpStatus: 400,
      details: { field: 'cursor' },
    });
    expect(readAdapter.listVisibleItems).not.toHaveBeenCalled();
  });

  it.each([
    ['upper', 2_147_483_647],
    ['lower', -2_147_483_648],
  ] as const)('accepts the signed Int32 %s boundary', (_label, value) => {
    const cursor = encodeStudentSubjectLessonsCursor({
      ...cursorPayload(),
      periodIndex: value,
      sortOrder: value,
    });

    expect(
      decodeStudentSubjectLessonsCursor(cursor, cursorIdentity()),
    ).toMatchObject({ periodIndex: value, sortOrder: value });
  });
});

function createUseCase(overrides?: { termId: string | null }): {
  useCase: ListStudentSubjectLessonsUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentSubjectLessonsReadAdapter>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest
      .fn()
      .mockResolvedValue(currentStudentFixture(overrides?.termId)),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    resolveEligibleSubject: jest.fn().mockResolvedValue({
      termStartDate: new Date('2026-09-01T00:00:00.000Z'),
      termEndDate: new Date('2026-12-31T00:00:00.000Z'),
    }),
    listVisibleItems: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<StudentSubjectLessonsReadAdapter>;

  return {
    useCase: new ListStudentSubjectLessonsUseCase(accessService, readAdapter),
    accessService,
    readAdapter,
  };
}

function currentStudentFixture(
  termId: string | null = TERM_ID,
): StudentAppCurrentStudentWithEnrollment {
  return {
    context: contextFixture(termId),
    student: {} as StudentAppCurrentStudentWithEnrollment['student'],
    enrollment: {} as StudentAppCurrentStudentWithEnrollment['enrollment'],
  };
}

function contextFixture(termId: string | null = TERM_ID): StudentAppContext {
  return {
    studentUserId: 'student-user',
    studentId: 'student',
    schoolId: 'school',
    organizationId: 'organization',
    membershipId: 'membership',
    roleId: 'role',
    permissions: ['academics.subjects.view', 'academics.lesson_plans.view'],
    enrollmentId: 'enrollment',
    classroomId: 'classroom',
    academicYearId: 'academic-year',
    termId,
  };
}

function itemFixture(
  overrides?: Partial<StudentSubjectLessonItemRecord>,
): StudentSubjectLessonItemRecord {
  return {
    id: ITEM_ID,
    plannedDate: new Date('2026-09-14T00:00:00.000Z'),
    status: LessonPlanItemStatus.PLANNED,
    title: 'Lesson item',
    sortOrder: 3,
    unit: { id: 'unit', title: 'Unit', sortOrder: 1 },
    lesson: {
      id: 'lesson',
      title: 'Lesson',
      sortOrder: 2,
      contentItems: [{ type: LessonContentItemType.TEXT, isRequired: false }],
    },
    timetableEntry: {
      academicYearId: 'academic-year',
      termId: TERM_ID,
      classroomId: 'classroom',
      period: { id: 'period', label: 'Period 1', periodIndex: 1 },
    },
    ...overrides,
  } as StudentSubjectLessonItemRecord;
}

function cursorIdentity(): StudentSubjectLessonsCursorIdentity {
  return {
    subjectId: SUBJECT_ID,
    termId: TERM_ID,
    from: '2026-09-01',
    to: '2026-12-31',
    status: null,
  };
}

function cursorPayload(): StudentSubjectLessonsCursorPayload {
  return {
    version: 1,
    ...cursorIdentity(),
    plannedDate: '2026-09-14',
    periodIndex: 1,
    sortOrder: 3,
    itemId: ITEM_ID,
  };
}

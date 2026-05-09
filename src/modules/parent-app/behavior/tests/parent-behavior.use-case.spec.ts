import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { GetParentChildBehaviorRecordUseCase } from '../application/get-parent-child-behavior-record.use-case';
import { GetParentChildBehaviorSummaryUseCase } from '../application/get-parent-child-behavior-summary.use-case';
import { ListParentChildBehaviorUseCase } from '../application/list-parent-child-behavior.use-case';
import {
  ParentBehaviorReadAdapter,
  type ParentBehaviorListReadModel,
  type ParentBehaviorRecordDetailReadModel,
  type ParentBehaviorSummaryReadModel,
} from '../infrastructure/parent-behavior-read.adapter';

describe('Parent Behavior use-cases', () => {
  it('rejects non-parent actors through ParentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.assertParentOwnsStudent.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(listUseCase.execute('student-1')).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(readAdapter.listVisibleBehaviorRecords).not.toHaveBeenCalled();
  });

  it('validates parent ownership before listing approved behavior records', async () => {
    const { listUseCase, accessService, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.listVisibleBehaviorRecords.mockResolvedValue(listFixture());

    const result = await listUseCase.execute('student-1', { type: 'positive' });

    expect(accessService.assertParentOwnsStudent).toHaveBeenCalledWith(
      'student-1',
    );
    expect(readAdapter.listVisibleBehaviorRecords).toHaveBeenCalledWith({
      child: childFixture(),
      query: { type: 'positive' },
    });
    expect(result.records).toEqual([
      expect.objectContaining({
        id: 'behavior-1',
        type: 'positive',
        points: 5,
        status: 'approved',
      }),
    ]);
  });

  it('summarizes positive and negative behavior points separately from XP', async () => {
    const { summaryUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.getBehaviorSummary.mockResolvedValue(summaryFixture());

    const result = await summaryUseCase.execute('student-1');
    const serialized = JSON.stringify(result.summary);

    expect(result.summary).toMatchObject({
      positiveCount: 1,
      negativeCount: 1,
      positivePoints: 5,
      negativePoints: -2,
      totalBehaviorPoints: 3,
    });
    expect(serialized).not.toContain('xp');
    expect(serialized).not.toContain('Xp');
  });

  it('rejects inaccessible behavior detail records', async () => {
    const { recordUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findVisibleBehaviorRecord.mockResolvedValue(null);

    await expect(
      recordUseCase.execute('student-1', 'outside-record'),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('returns safe behavior detail without review internals', async () => {
    const { recordUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findVisibleBehaviorRecord.mockResolvedValue(
      recordDetailFixture(),
    );

    const result = await recordUseCase.execute('student-1', 'behavior-1');
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      id: 'behavior-1',
      type: 'positive',
      points: 5,
      status: 'approved',
    });
    expect(serialized).not.toContain('reviewedById');
    expect(serialized).not.toContain('reviewNote');
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('scheduleId');
  });
});

function createUseCases(): {
  listUseCase: ListParentChildBehaviorUseCase;
  summaryUseCase: GetParentChildBehaviorSummaryUseCase;
  recordUseCase: GetParentChildBehaviorRecordUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentBehaviorReadAdapter>;
} {
  const accessService = {
    assertParentOwnsStudent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    listVisibleBehaviorRecords: jest.fn(),
    getBehaviorSummary: jest.fn(),
    findVisibleBehaviorRecord: jest.fn(),
  } as unknown as jest.Mocked<ParentBehaviorReadAdapter>;

  return {
    listUseCase: new ListParentChildBehaviorUseCase(accessService, readAdapter),
    summaryUseCase: new GetParentChildBehaviorSummaryUseCase(
      accessService,
      readAdapter,
    ),
    recordUseCase: new GetParentChildBehaviorRecordUseCase(
      accessService,
      readAdapter,
    ),
    accessService,
    readAdapter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.assertParentOwnsStudent.mockResolvedValue(
    childFixture(),
  );
  return created;
}

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

function summaryFixture(): ParentBehaviorSummaryReadModel {
  return {
    attendanceCount: 10,
    absenceCount: 1,
    latenessCount: 2,
    dateText: 'current_term',
    positiveCount: 1,
    negativeCount: 1,
    positivePoints: 5,
    negativePoints: -2,
    totalBehaviorPoints: 3,
  };
}

function listFixture(): ParentBehaviorListReadModel {
  return {
    child: childFixture(),
    records: [recordFixture()],
    summary: summaryFixture(),
    page: 1,
    limit: 50,
    total: 1,
  } as unknown as ParentBehaviorListReadModel;
}

function recordDetailFixture(): ParentBehaviorRecordDetailReadModel {
  return {
    child: childFixture(),
    record: recordFixture(),
  } as unknown as ParentBehaviorRecordDetailReadModel;
}

function recordFixture() {
  return {
    id: 'behavior-1',
    type: 'POSITIVE',
    status: 'APPROVED',
    titleEn: 'Helpful',
    titleAr: null,
    noteEn: 'Visible note',
    noteAr: null,
    points: 5,
    occurredAt: new Date('2026-10-04T08:00:00.000Z'),
    category: {
      id: 'category-1',
      code: 'HELPFUL',
      nameEn: 'Helpful',
      nameAr: null,
      type: 'POSITIVE',
    },
  };
}

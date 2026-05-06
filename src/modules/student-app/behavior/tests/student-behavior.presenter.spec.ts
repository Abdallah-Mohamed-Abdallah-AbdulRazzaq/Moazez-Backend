import { BehaviorRecordStatus, BehaviorRecordType } from '@prisma/client';
import { StudentBehaviorPresenter } from '../presenters/student-behavior.presenter';
import type {
  StudentBehaviorListReadModel,
  StudentBehaviorRecordReadModel,
  StudentBehaviorSummaryReadModel,
} from '../infrastructure/student-behavior-read.adapter';

describe('StudentBehaviorPresenter', () => {
  it('presents approved records without review internals or tenant ids', () => {
    const result = StudentBehaviorPresenter.presentList(listFixture());
    const serialized = JSON.stringify(result);

    expect(result.visibility).toEqual({
      status: 'approved',
      reason: 'approved_records_only',
    });
    expect(result.records[0]).toMatchObject({
      id: 'behavior-record-1',
      type: 'negative',
      title: 'Late to class',
      points: -2,
      status: 'approved',
    });
    expect(result.summary).toMatchObject({
      positivePoints: 5,
      negativePoints: -2,
      totalBehaviorPoints: 3,
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('scheduleId');
    expect(serialized).not.toContain('reviewedBy');
    expect(serialized).not.toContain('reviewNote');
    expect(serialized).not.toContain('xp');
  });
});

function listFixture(): StudentBehaviorListReadModel {
  return {
    records: [
      {
        id: 'behavior-record-1',
        type: BehaviorRecordType.NEGATIVE,
        status: BehaviorRecordStatus.APPROVED,
        titleEn: 'Late to class',
        titleAr: null,
        noteEn: 'Visible student-facing note',
        noteAr: null,
        points: -2,
        occurredAt: new Date('2026-10-01T08:00:00.000Z'),
        category: {
          id: 'category-1',
          code: 'LATE',
          nameEn: 'Late',
          nameAr: null,
          type: BehaviorRecordType.NEGATIVE,
        },
      } as unknown as StudentBehaviorRecordReadModel,
    ],
    summary: summaryFixture(),
    page: 1,
    limit: 50,
    total: 1,
  };
}

function summaryFixture(): StudentBehaviorSummaryReadModel {
  return {
    attendanceCount: 3,
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

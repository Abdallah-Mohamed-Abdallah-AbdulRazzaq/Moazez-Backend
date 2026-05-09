import { ParentBehaviorPresenter } from '../presenters/parent-behavior.presenter';
import type {
  ParentBehaviorListReadModel,
  ParentBehaviorRecordDetailReadModel,
} from '../infrastructure/parent-behavior-read.adapter';

describe('ParentBehaviorPresenter', () => {
  it('presents approved behavior records and separate point summaries', () => {
    const result = ParentBehaviorPresenter.presentList(listFixture());

    expect(result.summary).toMatchObject({
      positiveCount: 1,
      negativeCount: 1,
      positivePoints: 5,
      negativePoints: -2,
      totalBehaviorPoints: 3,
    });
    expect(result.records[0]).toMatchObject({
      id: 'behavior-1',
      type: 'positive',
      status: 'approved',
      points: 5,
    });
  });

  it('does not expose review internals, tenant fields, schedule ids, or XP fields', () => {
    const result = ParentBehaviorPresenter.presentRecord(recordDetailFixture());
    const serialized = JSON.stringify(result);

    for (const forbidden of [
      'reviewedById',
      'reviewNote',
      'schoolId',
      'organizationId',
      'scheduleId',
      'xp',
      'Xp',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function listFixture(): ParentBehaviorListReadModel {
  return {
    child: childFixture(),
    records: [recordFixture()],
    summary: {
      attendanceCount: 10,
      absenceCount: 1,
      latenessCount: 2,
      dateText: 'current_term',
      positiveCount: 1,
      negativeCount: 1,
      positivePoints: 5,
      negativePoints: -2,
      totalBehaviorPoints: 3,
    },
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

function childFixture() {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
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

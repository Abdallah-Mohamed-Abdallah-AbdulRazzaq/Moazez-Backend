import { StudentSubjectsPresenter } from '../presenters/student-subjects.presenter';
import type {
  StudentSubjectAllocationRecord,
  StudentSubjectStatsRecord,
} from '../infrastructure/student-subjects-read.adapter';

describe('StudentSubjectsPresenter', () => {
  it('presents safe subject cards and removes duplicate allocations', () => {
    const allocation = allocationFixture();
    const result = StudentSubjectsPresenter.presentList({
      allocations: [allocation, { ...allocation, id: 'allocation-2' }],
      statsBySubjectId: statsMapFixture(),
    });

    expect(result.subjects).toHaveLength(1);
    expect(result.subjects[0]).toMatchObject({
      id: 'subject-1',
      subjectId: 'subject-1',
      name: 'Mathematics',
      code: 'MATH',
      teacher: {
        teacherUserId: 'teacher-1',
        displayName: 'Tala Teacher',
      },
      stats: {
        assessmentsCount: 2,
        earnedScore: 18,
        maxScore: 20,
      },
      lessonsCount: null,
      progress: null,
    });
  });

  it('presents safe detail placeholders for unsupported resources', () => {
    const result = StudentSubjectsPresenter.presentDetail({
      allocation: allocationFixture(),
      statsBySubjectId: statsMapFixture(),
    });

    expect(result.lessons).toEqual([]);
    expect(result.assignments).toEqual([]);
    expect(result.attachments).toEqual([]);
    expect(result.subject.resources).toEqual({
      attachmentsCount: 0,
      unsupportedReason: 'safe_subject_resource_links_not_available',
    });
  });

  it('does not expose tenant, schedule, or raw storage fields', () => {
    const serialized = JSON.stringify(
      StudentSubjectsPresenter.presentDetail({
        allocation: allocationFixture(),
        statsBySubjectId: statsMapFixture(),
      }),
    );

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'bucket',
      'objectKey',
      'storageKey',
      'directUrl',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function allocationFixture(): StudentSubjectAllocationRecord {
  return {
    id: 'allocation-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    teacherUser: {
      id: 'teacher-1',
      firstName: 'Tala',
      lastName: 'Teacher',
    },
    subject: {
      id: 'subject-1',
      nameAr: 'Mathematics AR',
      nameEn: 'Mathematics',
      code: 'MATH',
      color: null,
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Grade 4A AR',
      nameEn: 'Grade 4A',
      section: {
        id: 'section-1',
        nameAr: 'Section A AR',
        nameEn: 'Section A',
        grade: {
          id: 'grade-1',
          nameAr: 'Grade 4 AR',
          nameEn: 'Grade 4',
          stage: {
            id: 'stage-1',
            nameAr: 'Primary AR',
            nameEn: 'Primary',
          },
        },
      },
    },
  } as StudentSubjectAllocationRecord;
}

function statsMapFixture(): Map<string, StudentSubjectStatsRecord> {
  return new Map([
    [
      'subject-1',
      {
        assessmentsCount: 2,
        gradedCount: 2,
        missingCount: 0,
        absentCount: 0,
        earnedScore: 18,
        maxScore: 20,
        averagePercent: 90,
      },
    ],
  ]);
}

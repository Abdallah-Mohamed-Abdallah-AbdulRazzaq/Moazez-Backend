import { StudentStatus } from '@prisma/client';
import type { ParentChildEnrollmentRecord } from '../infrastructure/parent-children-read.adapter';
import { ParentChildrenPresenter } from '../presenters/parent-children.presenter';

describe('ParentChildrenPresenter', () => {
  it('presents child cards and detail unsupported slices safely', () => {
    const list = ParentChildrenPresenter.presentList([childFixture()]);
    const detail = ParentChildrenPresenter.presentDetail(childFixture());

    expect(list[0]).toMatchObject({
      studentId: 'student-1',
      displayName: 'Sara Child',
      avatarUrl: null,
      status: 'active',
      enrollmentId: 'enrollment-1',
      classroom: { id: 'classroom-1', name: 'Grade 4A' },
    });
    expect(detail.summaries).toEqual({
      attendance: {
        available: false,
        reason: 'detailed_attendance_not_in_this_slice',
      },
      grades: {
        available: false,
        reason: 'grades_slice_not_loaded',
      },
      behavior: {
        available: false,
        reason: 'behavior_slice_not_loaded',
      },
      progress: {
        available: false,
        reason: 'progress_slice_not_loaded',
      },
    });
    expect(detail.unsupported).toEqual({
      schedule: true,
      homeworks: true,
      pickup: true,
    });
  });

  it('does not expose forbidden child fields', () => {
    const serialized = JSON.stringify(
      ParentChildrenPresenter.presentDetail(childFixture()),
    );

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'medical',
      'document',
      'internalNote',
      'guardian',
      'password',
      'session',
      'token',
      'objectKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function childFixture(): ParentChildEnrollmentRecord {
  return {
    id: 'enrollment-1',
    studentId: 'student-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    student: {
      id: 'student-1',
      firstName: 'Sara',
      lastName: 'Child',
      status: StudentStatus.ACTIVE,
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
  };
}

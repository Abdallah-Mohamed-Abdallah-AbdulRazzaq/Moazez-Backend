import { StudentStatus, UserStatus, UserType } from '@prisma/client';
import { ParentHomePresenter } from '../presenters/parent-home.presenter';
import type {
  ParentHomeChildRecord,
  ParentHomeIdentityRecord,
} from '../infrastructure/parent-home-read.adapter';

describe('ParentHomePresenter', () => {
  it('presents the basic Parent App home contract with stable unavailable fields', () => {
    const result = ParentHomePresenter.present({
      parent: parentIdentityFixture(),
      school: { name: 'Moazez Demo School', logoUrl: null },
      children: [childFixture()],
      pendingTaskCounts: [{ studentId: 'student-1', count: 3 }],
    });

    expect(result.children[0].summaries).toEqual({
      attendanceToday: null,
      gradesAverage: null,
      behaviorPoints: null,
      pendingTasksCount: 3,
      unreadMessagesCount: null,
    });
    expect(result.summaries).toEqual({
      childrenCount: 1,
      pendingTasksCount: 3,
      unreadMessagesCount: null,
      announcementsCount: null,
    });
    expect(result.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
    });
  });

  it('does not expose forbidden Parent App fields', () => {
    const serialized = JSON.stringify(
      ParentHomePresenter.present({
        parent: parentIdentityFixture(),
        school: { name: 'Moazez Demo School', logoUrl: null },
        children: [childFixture()],
        pendingTaskCounts: [],
      }),
    );

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'medical',
      'document',
      'internalNote',
      'password',
      'session',
      'token',
      'objectKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function parentIdentityFixture(): ParentHomeIdentityRecord {
  return {
    id: 'parent-user-1',
    email: 'parent@example.test',
    phone: null,
    firstName: 'Mona',
    lastName: 'Parent',
    userType: UserType.PARENT,
    status: UserStatus.ACTIVE,
    deletedAt: null,
  };
}

function childFixture(): ParentHomeChildRecord {
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

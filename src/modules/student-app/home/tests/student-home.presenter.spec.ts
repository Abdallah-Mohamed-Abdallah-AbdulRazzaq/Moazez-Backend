import { UserStatus, UserType } from '@prisma/client';
import { StudentHomePresenter } from '../presenters/student-home.presenter';
import type {
  StudentHomeEnrollmentRecord,
  StudentHomeIdentityRecord,
} from '../infrastructure/student-home-read.adapter';

describe('StudentHomePresenter', () => {
  it('presents the basic Student App home contract with stable unsupported fields', () => {
    const result = StudentHomePresenter.present({
      student: studentIdentityFixture(),
      school: { name: 'Moazez Demo School', logoUrl: null },
      enrollment: enrollmentFixture(),
      subjectsCount: 4,
      pendingTasksCount: 1,
      totalXp: 220,
    });

    expect(result.student_summary).toEqual({
      name: 'Sara Student',
      avatar_url: null,
      level: 0,
      current_xp: 220,
      next_level_xp: 0,
      notifications_count: 0,
    });
    expect(result.hero_journey_preview).toEqual({
      title: null,
      image_url: null,
    });
    expect(result.today.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
    });
    expect(result.summaries.behaviorPoints).toBeNull();
    expect(result.required_today).toEqual([]);
    expect(result.today_tasks).toEqual([]);
  });

  it('does not expose forbidden Student App fields', () => {
    const serialized = JSON.stringify(
      StudentHomePresenter.present({
        student: studentIdentityFixture(),
        school: { name: 'Moazez Demo School', logoUrl: null },
        enrollment: enrollmentFixture(),
        subjectsCount: 0,
        pendingTasksCount: 0,
        totalXp: 0,
      }),
    );

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'guardian',
      'medical',
      'document',
      'note',
      'password',
      'session',
      'token',
      'objectKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function studentIdentityFixture(): StudentHomeIdentityRecord {
  return {
    id: 'student-1',
    firstName: 'Sara',
    lastName: 'Student',
    userId: 'student-user-1',
    user: {
      id: 'student-user-1',
      firstName: 'Sara',
      lastName: 'Student',
      userType: UserType.STUDENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
  } as StudentHomeIdentityRecord;
}

function enrollmentFixture(): StudentHomeEnrollmentRecord {
  return {
    id: 'enrollment-1',
    academicYearId: 'year-1',
    termId: 'term-1',
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

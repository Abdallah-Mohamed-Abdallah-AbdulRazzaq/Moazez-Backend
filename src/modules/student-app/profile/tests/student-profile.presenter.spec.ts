import { UserStatus, UserType } from '@prisma/client';
import type {
  StudentProfileEnrollmentRecord,
  StudentProfileIdentityRecord,
} from '../infrastructure/student-profile-read.adapter';
import { StudentProfilePresenter } from '../presenters/student-profile.presenter';

describe('StudentProfilePresenter', () => {
  it('presents the basic Student App profile contract', () => {
    const result = StudentProfilePresenter.present({
      student: studentProfileFixture(),
      school: { name: 'Moazez Demo School', logoUrl: null },
      enrollment: enrollmentFixture(),
      totalXp: 90,
    });

    expect(result.student).toMatchObject({
      studentId: 'student-1',
      userId: 'student-user-1',
      displayName: 'Sara Student',
      email: 'sara.student@example.test',
      phone: null,
      avatarUrl: null,
      studentNumber: null,
      status: 'active',
    });
    expect(result.unsupported).toEqual({
      avatarUpload: true,
      preferences: true,
      seatNumber: true,
    });
    expect(result.student_profile).toMatchObject({
      name: 'Sara Student',
      grade: 'Grade 4',
      school_name: 'Moazez Demo School',
      student_code: null,
      current_xp: 90,
      total_xp: 90,
      next_level_xp: 0,
      rank_title: null,
      rank_image_url: null,
    });
  });

  it('does not expose forbidden Student App fields', () => {
    const serialized = JSON.stringify(
      StudentProfilePresenter.present({
        student: studentProfileFixture(),
        school: { name: 'Moazez Demo School', logoUrl: null },
        enrollment: enrollmentFixture(),
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

function studentProfileFixture(): StudentProfileIdentityRecord {
  return {
    id: 'student-1',
    firstName: 'Sara',
    lastName: 'Student',
    userId: 'student-user-1',
    status: 'ACTIVE',
    user: {
      id: 'student-user-1',
      email: 'sara.student@example.test',
      phone: null,
      firstName: 'Sara',
      lastName: 'Student',
      userType: UserType.STUDENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
  } as StudentProfileIdentityRecord;
}

function enrollmentFixture(): StudentProfileEnrollmentRecord {
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

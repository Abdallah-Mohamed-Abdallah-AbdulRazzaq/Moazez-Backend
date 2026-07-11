import { UserStatus, UserType } from '@prisma/client';
import { TeacherProfilePresenter } from '../presenters/teacher-profile.presenter';

describe('TeacherProfilePresenter', () => {
  it('maps profile data to the safe Teacher App contract', () => {
    const result = TeacherProfilePresenter.presentProfile({
      teacher: {
        id: 'teacher-1',
        email: 'teacher@moazez.local',
        phone: null,
        firstName: 'Test',
        lastName: 'Teacher',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      },
      school: {
        name: 'Moazez Academy',
        logoUrl: null,
      },
      role: {
        role: { name: 'Teacher' },
      },
      classesSummary: {
        classesCount: 2,
        subjectsCount: 1,
        studentsCount: 35,
      },
      permissions: ['reinforcement.xp.view'],
    });
    const json = JSON.stringify(result);

    expect(result).toEqual({
      teacher: {
        userId: 'teacher-1',
        displayName: 'Test Teacher',
        email: 'teacher@moazez.local',
        phone: null,
        avatarUrl: null,
        userType: 'teacher',
      },
      school: {
        name: 'Moazez Academy',
        logoUrl: null,
      },
      role: {
        name: 'Teacher',
      },
      classesSummary: {
        classesCount: 2,
        subjectsCount: 1,
        studentsCount: 35,
      },
      permissions: ['reinforcement.xp.view'],
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('password');
    expect(json).not.toContain('session');
    expect(hasObjectKey(result, 'roleId')).toBe(false);
  });

  it('returns stable unsupported employment data', () => {
    expect(TeacherProfilePresenter.presentEmploymentUnsupported()).toEqual({
      employment: {
        employeeId: null,
        department: null,
        specialization: null,
        employmentType: null,
        joiningDate: null,
        officeHours: null,
        manager: null,
        status: 'unsupported',
      },
      reason: 'teacher_employment_profile_not_available',
    });
  });
});

function hasObjectKey(value: unknown, forbiddenKey: string): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasObjectKey(item, forbiddenKey));
  }

  return Object.entries(value).some(
    ([key, nested]) =>
      key === forbiddenKey || hasObjectKey(nested, forbiddenKey),
  );
}

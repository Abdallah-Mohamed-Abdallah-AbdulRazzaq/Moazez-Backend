import { UserStatus, UserType } from '@prisma/client';
import { TeacherHomePresenter } from '../presenters/teacher-home.presenter';

describe('TeacherHomePresenter', () => {
  it('maps teacher home data to contract and compact app-facing fields', () => {
    const result = TeacherHomePresenter.present({
      teacher: {
        id: 'teacher-1',
        email: 'teacher@moazez.local',
        firstName: 'Test',
        lastName: 'Teacher',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      },
      school: {
        name: 'Moazez Academy',
        logoUrl: null,
      },
      classesCount: 2,
      studentsCount: 35,
      pendingTasksCount: 4,
      now: new Date('2026-05-04T08:00:00.000Z'),
    });

    expect(result.userInfo).toMatchObject({
      id: 'teacher-1',
      name: 'Test Teacher',
      email: 'teacher@moazez.local',
      userType: 'teacher',
      points: 0,
      avatarUrl: null,
    });
    expect(result.teacher).toMatchObject({
      id: 'teacher-1',
      name: 'Test Teacher',
      email: 'teacher@moazez.local',
      userType: 'teacher',
    });
    expect(result.school).toEqual({
      name: 'Moazez Academy',
      logoUrl: null,
    });
    expect(result.summary).toEqual({
      classesCount: 2,
      studentsCount: 35,
      pendingTasksCount: 4,
      unreadMessagesCount: null,
      unreadNotificationsCount: null,
    });
    expect(result.stats).toEqual([
      {
        title: 'Teacher points',
        value: '0',
        subValue: 'Not available in V1 core data',
        type: 'points',
      },
      {
        title: 'Assigned classes',
        value: '2',
        subValue: null,
        type: 'remainingClasses',
      },
      {
        title: 'Students',
        value: '35',
        subValue: null,
        type: 'currentClass',
      },
    ]);
  });

  it('omits schoolId and returns stable schedule-unavailable fields', () => {
    const result = TeacherHomePresenter.present({
      teacher: {
        id: 'teacher-1',
        email: 'teacher@moazez.local',
        firstName: 'Test',
        lastName: 'Teacher',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      },
      school: {
        name: 'Moazez Academy',
        logoUrl: null,
      },
      classesCount: 0,
      studentsCount: 0,
      pendingTasksCount: 0,
      now: new Date('2026-05-04T08:00:00.000Z'),
    });
    const json = JSON.stringify(result);

    expect(result.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
      items: [],
    });
    expect(result.weeklySchedule).toEqual([]);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });
});

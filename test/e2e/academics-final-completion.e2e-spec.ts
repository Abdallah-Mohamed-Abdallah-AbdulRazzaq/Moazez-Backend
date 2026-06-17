import request from 'supertest';
import {
  AppFacingCalendarFixture,
  bearer,
  createAppFacingCalendarFixture,
  expectNoObjectKey,
  GLOBAL_PREFIX,
  listRegisteredRoutes,
} from '../helpers/app-facing-calendar-test-utils';

jest.setTimeout(180000);

describe('Academics final completion route and read-model sweep (e2e)', () => {
  let fixture: AppFacingCalendarFixture;

  beforeAll(async () => {
    fixture = await createAppFacingCalendarFixture('academics-final');
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it('registers the accepted Academics V1 dashboard and app-facing route surface', () => {
    const routes = listRegisteredRoutes(fixture.app);

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/academics/overview',
        'GET /api/v1/academics/calendar/events',
        'POST /api/v1/academics/calendar/events',
        'GET /api/v1/academics/subjects',
        'GET /api/v1/academics/subject-allocations',
        'PUT /api/v1/academics/subject-allocations/bulk',
        'GET /api/v1/academics/allocations',
        'PUT /api/v1/academics/allocations/bulk',
        'POST /api/v1/academics/allocations/apply-to-grade',
        'POST /api/v1/academics/allocations/clear-subject',
        'GET /api/v1/academics/allocations/validation',
        'GET /api/v1/academics/allocations/teacher-loads',
        'GET /api/v1/academics/timetable/all',
        'PUT /api/v1/academics/timetable/entries/bulk',
        'DELETE /api/v1/academics/timetable/entries/:entryId',
        'POST /api/v1/academics/timetable/publish',
        'POST /api/v1/academics/timetable/unpublish',
        'GET /api/v1/academics/timetable/validate',
        'POST /api/v1/academics/timetable/conflicts/check',
        'GET /api/v1/academics/curriculum',
        'POST /api/v1/academics/curriculum',
        'GET /api/v1/academics/lesson-plans',
        'GET /api/v1/academics/lesson-plans/weeks',
        'GET /api/v1/academics/lesson-plans/summary',
        'POST /api/v1/academics/lesson-plans/auto-plan',
        'PATCH /api/v1/academics/lesson-plans/items/:itemId/move',
        'GET /api/v1/academics/lesson-plans/validation',
        'GET /api/v1/teacher/schedule',
        'GET /api/v1/teacher/schedule/week',
        'GET /api/v1/teacher/my-classes',
        'GET /api/v1/teacher/lesson-preparation/today',
        'GET /api/v1/teacher/lesson-preparation/week',
        'GET /api/v1/teacher/lesson-preparation/:lessonPlanItemId',
        'PATCH /api/v1/teacher/lesson-preparation/:lessonPlanItemId/status',
        'GET /api/v1/student/schedule',
        'GET /api/v1/student/schedule/week',
        'GET /api/v1/student/subjects',
        'GET /api/v1/student/calendar/events',
        'GET /api/v1/student/lessons/today',
        'GET /api/v1/student/lessons/week',
        'GET /api/v1/student/lessons/:lessonPlanItemId',
        'GET /api/v1/parent/children/:studentId/schedule/today',
        'GET /api/v1/parent/children/:studentId/schedule/weekly',
        'GET /api/v1/parent/children/:studentId/calendar/events',
        'GET /api/v1/parent/children/:studentId/lessons/today',
        'GET /api/v1/parent/children/:studentId/lessons/week',
        'GET /api/v1/parent/children/:studentId/lessons/:lessonPlanItemId',
      ]),
    );

    expect(routes).not.toContain('POST /api/v1/student/lessons');
    expect(routes).not.toContain('PATCH /api/v1/student/lessons/:lessonPlanItemId/status');
    expect(routes).not.toContain('POST /api/v1/parent/children/:studentId/lessons');
    expect(routes).not.toContain(
      'PATCH /api/v1/parent/children/:studentId/lessons/:lessonPlanItemId/status',
    );
  });

  it('keeps calendar and schedule separated for Teacher, Student, and Parent app reads', async () => {
    const teacherCalendar = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/calendar/events`)
      .query({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.000Z' })
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(200);

    const studentCalendar = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/calendar/events`)
      .query({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.000Z' })
      .set('Authorization', bearer(fixture.student.auth))
      .expect(200);

    const parentCalendar = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${fixture.ownedChildStudentId}/calendar/events`)
      .query({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.000Z' })
      .set('Authorization', bearer(fixture.parent.auth))
      .expect(200);

    for (const body of [teacherCalendar.body, studentCalendar.body, parentCalendar.body]) {
      expect(body.items.length).toBeGreaterThan(0);
      expectNoObjectKey(body, 'schoolId');
      expectNoObjectKey(body, 'organizationId');
      expectNoObjectKey(body, 'notes');
      expectNoObjectKey(body, 'deletedAt');
    }

    await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/schedule`)
      .query({ date: '2026-10-01' })
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(200);

    await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/schedule`)
      .query({ date: '2026-10-01' })
      .set('Authorization', bearer(fixture.student.auth))
      .expect(200);

    await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${fixture.ownedChildStudentId}/schedule/today`)
      .query({ date: '2026-10-01' })
      .set('Authorization', bearer(fixture.parent.auth))
      .expect(200);
  });

  it('keeps app-facing lesson content read-only and safe when no planned lessons exist', async () => {
    const teacherToday = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/lesson-preparation/today`)
      .query({ date: '2026-10-01' })
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(200);

    const studentToday = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/lessons/today`)
      .query({ date: '2026-10-01' })
      .set('Authorization', bearer(fixture.student.auth))
      .expect(200);

    const parentToday = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${fixture.ownedChildStudentId}/lessons/today`)
      .query({ date: '2026-10-01' })
      .set('Authorization', bearer(fixture.parent.auth))
      .expect(200);

    expect(teacherToday.body.items).toEqual([]);
    expect(studentToday.body.items).toEqual([]);
    expect(parentToday.body.items).toEqual([]);

    for (const body of [teacherToday.body, studentToday.body, parentToday.body]) {
      expectNoObjectKey(body, 'schoolId');
      expectNoObjectKey(body, 'organizationId');
      expectNoObjectKey(body, 'deletedAt');
      expectNoObjectKey(body, 'objectKey');
      expectNoObjectKey(body, 'bucket');
      expectNoObjectKey(body, 'passwordHash');
    }
  });
});

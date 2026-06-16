import request from 'supertest';
import {
  AppFacingCalendarFixture,
  bearer,
  createAppFacingCalendarFixture,
  expectNoHiddenAppCalendarFields,
  extractCalendarItemIds,
  GLOBAL_PREFIX,
  listRegisteredRoutes,
} from '../helpers/app-facing-calendar-test-utils';

const CURRENT_RANGE_QUERY = {
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-10-31T23:59:59.000Z',
};

const VISIBLE_EVENT_KEYS = ['school', 'stage', 'grade', 'section'] as const;
const HIDDEN_EVENT_KEYS = [
  'unrelatedStage',
  'unrelatedGrade',
  'unrelatedSection',
  'crossSchool',
  'otherAcademicSameSection',
  'softDeleted',
] as const;

jest.setTimeout(180000);

describe('App-facing academic calendar (e2e)', () => {
  let fixture: AppFacingCalendarFixture;

  beforeAll(async () => {
    fixture = await createAppFacingCalendarFixture('e2e');
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it('registers app calendar read routes, omits app mutations, and preserves dashboard and schedule route inventory', () => {
    const routes = listRegisteredRoutes(fixture.app);

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/teacher/calendar/events',
        'GET /api/v1/teacher/calendar/events/:eventId',
        'GET /api/v1/student/calendar/events',
        'GET /api/v1/student/calendar/events/:eventId',
        'GET /api/v1/parent/children/:studentId/calendar/events',
        'GET /api/v1/parent/children/:studentId/calendar/events/:eventId',
        'GET /api/v1/academics/calendar/events',
        'POST /api/v1/academics/calendar/events',
        'GET /api/v1/academics/calendar/events/:eventId',
        'PATCH /api/v1/academics/calendar/events/:eventId',
        'DELETE /api/v1/academics/calendar/events/:eventId',
        'GET /api/v1/dashboard/summary',
        'GET /api/v1/dashboard/alerts',
        'GET /api/v1/dashboard/activity-feed',
        'GET /api/v1/teacher/schedule',
        'GET /api/v1/teacher/schedule/week',
        'GET /api/v1/student/schedule',
        'GET /api/v1/student/schedule/week',
        'GET /api/v1/parent/children/:studentId/schedule/today',
        'GET /api/v1/parent/children/:studentId/schedule/weekly',
      ]),
    );

    for (const absentRoute of [
      'POST /api/v1/teacher/calendar/events',
      'PATCH /api/v1/teacher/calendar/events/:eventId',
      'DELETE /api/v1/teacher/calendar/events/:eventId',
      'POST /api/v1/student/calendar/events',
      'PATCH /api/v1/student/calendar/events/:eventId',
      'DELETE /api/v1/student/calendar/events/:eventId',
      'POST /api/v1/parent/children/:studentId/calendar/events',
      'PATCH /api/v1/parent/children/:studentId/calendar/events/:eventId',
      'DELETE /api/v1/parent/children/:studentId/calendar/events/:eventId',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('serves the teacher calendar list and detail over HTTP with allocation visibility', async () => {
    const response = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/calendar/events`)
      .query(CURRENT_RANGE_QUERY)
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(200);

    expectVisibleCurrentEvents(response.body);
    expectHiddenCurrentEvents(response.body);
    expectNoHiddenAppCalendarFields(response.body);

    const detail = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/calendar/events/${fixture.events.section}`)
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(200);

    expect(detail.body).toMatchObject({
      id: fixture.events.section,
      type: 'exam',
      scope: { type: 'section', id: fixture.academicA.sectionId },
    });
    expectNoHiddenAppCalendarFields(detail.body);

    await expectCalendarDetailNotFound(
      `/teacher/calendar/events/${fixture.events.unrelatedSection}`,
      fixture.teacher.auth,
    );
    await expectCalendarDetailNotFound(
      `/teacher/calendar/events/${fixture.events.crossSchool}`,
      fixture.teacher.auth,
    );
  });

  it('serves the student calendar list and detail over HTTP with current enrollment visibility', async () => {
    const response = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/calendar/events`)
      .query(CURRENT_RANGE_QUERY)
      .set('Authorization', bearer(fixture.student.auth))
      .expect(200);

    expectVisibleCurrentEvents(response.body);
    expectHiddenCurrentEvents(response.body);
    expectNoHiddenAppCalendarFields(response.body);

    const detail = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/calendar/events/${fixture.events.stage}`)
      .set('Authorization', bearer(fixture.student.auth))
      .expect(200);

    expect(detail.body).toMatchObject({
      id: fixture.events.stage,
      type: 'activity',
      scope: { type: 'stage', id: fixture.academicA.stageId },
    });
    expectNoHiddenAppCalendarFields(detail.body);

    await expectCalendarDetailNotFound(
      `/student/calendar/events/${fixture.events.unrelatedGrade}`,
      fixture.student.auth,
    );
    await expectCalendarDetailNotFound(
      `/student/calendar/events/${fixture.events.crossSchool}`,
      fixture.student.auth,
    );
    await expectCalendarDetailNotFound(
      `/student/calendar/events/${fixture.events.otherAcademicSameSection}`,
      fixture.student.auth,
    );
  });

  it('serves owned child parent calendar routes and rejects non-owned children', async () => {
    const ownedPath = `/parent/children/${fixture.ownedChildStudentId}/calendar/events`;
    const response = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}${ownedPath}`)
      .query(CURRENT_RANGE_QUERY)
      .set('Authorization', bearer(fixture.parent.auth))
      .expect(200);

    expectVisibleCurrentEvents(response.body);
    expectHiddenCurrentEvents(response.body);
    expectNoHiddenAppCalendarFields(response.body);

    await request(fixture.app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${fixture.nonOwnedChildStudentId}/calendar/events`,
      )
      .query(CURRENT_RANGE_QUERY)
      .set('Authorization', bearer(fixture.parent.auth))
      .expect(404);

    const detail = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}${ownedPath}/${fixture.events.grade}`)
      .set('Authorization', bearer(fixture.parent.auth))
      .expect(200);

    expect(detail.body).toMatchObject({
      id: fixture.events.grade,
      type: 'other',
      scope: { type: 'grade', id: fixture.academicA.gradeId },
    });
    expectNoHiddenAppCalendarFields(detail.body);

    for (const eventId of [
      fixture.events.unrelatedStage,
      fixture.events.crossSchool,
      fixture.events.otherAcademicSameSection,
    ]) {
      await expectCalendarDetailNotFound(`${ownedPath}/${eventId}`, fixture.parent.auth);
    }
  });

  it('applies app calendar query filters without widening visibility', async () => {
    const byDate = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/calendar/events`)
      .query({
        from: '2026-10-04T00:00:00.000Z',
        to: '2026-10-04T23:59:59.000Z',
      })
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(200);
    expect(extractCalendarItemIds(byDate.body)).toEqual([
      fixture.events.section,
    ]);

    const byType = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/calendar/events`)
      .query({ ...CURRENT_RANGE_QUERY, type: 'exam' })
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(200);
    expect(extractCalendarItemIds(byType.body)).toEqual([
      fixture.events.section,
    ]);

    const byScope = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/calendar/events`)
      .query({ ...CURRENT_RANGE_QUERY, scopeType: 'section' })
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(200);
    expect(extractCalendarItemIds(byScope.body)).toEqual([
      fixture.events.section,
    ]);

    const firstPage = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/calendar/events`)
      .query({ ...CURRENT_RANGE_QUERY, limit: 1 })
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(200);
    expect(firstPage.body.items).toHaveLength(1);
    expect(firstPage.body.nextCursor).toBe(fixture.events.school);

    const secondPage = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/calendar/events`)
      .query({ ...CURRENT_RANGE_QUERY, limit: 1, cursor: firstPage.body.nextCursor })
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(200);
    expect(extractCalendarItemIds(secondPage.body)).toEqual([
      fixture.events.stage,
    ]);
  });

  it('rejects invalid app calendar query inputs over HTTP', async () => {
    await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/calendar/events`)
      .query({
        from: '2026-10-31T23:59:59.000Z',
        to: '2026-10-01T00:00:00.000Z',
      })
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.invalid_list_range',
        );
      });

    await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/calendar/events`)
      .query({
        from: '2026-01-01T00:00:00.000Z',
        to: '2028-01-10T00:00:00.000Z',
      })
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.invalid_list_range',
        );
      });

    await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/calendar/events`)
      .query({ ...CURRENT_RANGE_QUERY, academicYearId: 'not-a-uuid' })
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(400)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('validation.failed');
      });

    await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/calendar/events`)
      .query({ ...CURRENT_RANGE_QUERY, limit: 101 })
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(400)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('validation.failed');
      });

    for (const unsupportedKey of ['schoolId', 'organizationId', 'scopeId']) {
      await request(fixture.app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/calendar/events`)
        .query({ ...CURRENT_RANGE_QUERY, [unsupportedKey]: fixture.schoolAId })
        .set('Authorization', bearer(fixture.teacher.auth))
        .expect(400)
        .expect((response) => {
          expect(response.body?.error?.code).toBe('validation.failed');
        });
    }
  });

  it('excludes soft-deleted events from app calendar list and detail routes', async () => {
    const actorChecks = [
      {
        path: '/teacher/calendar/events',
        auth: fixture.teacher.auth,
      },
      {
        path: '/student/calendar/events',
        auth: fixture.student.auth,
      },
      {
        path: `/parent/children/${fixture.ownedChildStudentId}/calendar/events`,
        auth: fixture.parent.auth,
      },
    ];

    for (const actor of actorChecks) {
      const list = await request(fixture.app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${actor.path}`)
        .query(CURRENT_RANGE_QUERY)
        .set('Authorization', bearer(actor.auth))
        .expect(200);
      expect(extractCalendarItemIds(list.body)).not.toContain(
        fixture.events.softDeleted,
      );

      await expectCalendarDetailNotFound(
        `${actor.path}/${fixture.events.softDeleted}`,
        actor.auth,
      );
    }
  });

  function expectVisibleCurrentEvents(body: unknown): void {
    const ids = extractCalendarItemIds(body);
    for (const eventKey of VISIBLE_EVENT_KEYS) {
      expect(ids).toContain(fixture.events[eventKey]);
    }
  }

  function expectHiddenCurrentEvents(body: unknown): void {
    const ids = extractCalendarItemIds(body);
    for (const eventKey of HIDDEN_EVENT_KEYS) {
      expect(ids).not.toContain(fixture.events[eventKey]);
    }
  }

  async function expectCalendarDetailNotFound(
    path: string,
    auth: { accessToken: string; refreshToken: string },
  ): Promise<void> {
    await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}${path}`)
      .set('Authorization', bearer(auth))
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.not_found',
        );
        expectNoHiddenAppCalendarFields(response.body);
      });
  }
});

import request from 'supertest';
import {
  AppFacingCalendarFixture,
  AuthTokens,
  bearer,
  createAppFacingCalendarFixture,
  expectNoHiddenAppCalendarFields,
  extractCalendarItemIds,
  GLOBAL_PREFIX,
} from '../helpers/app-facing-calendar-test-utils';

const CURRENT_RANGE_QUERY = {
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-10-31T23:59:59.000Z',
};

jest.setTimeout(180000);

describe('App-facing academic calendar tenancy and ownership (security)', () => {
  let fixture: AppFacingCalendarFixture;

  beforeAll(async () => {
    fixture = await createAppFacingCalendarFixture('security');
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it('enforces teacher calendar visibility by owned allocation and school', async () => {
    const response = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/calendar/events`)
      .query(CURRENT_RANGE_QUERY)
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(200);

    const ids = extractCalendarItemIds(response.body);
    expect(ids).toEqual(
      expect.arrayContaining([
        fixture.events.school,
        fixture.events.stage,
        fixture.events.grade,
        fixture.events.section,
      ]),
    );
    expect(ids).not.toEqual(
      expect.arrayContaining([
        fixture.events.unrelatedStage,
        fixture.events.unrelatedGrade,
        fixture.events.unrelatedSection,
        fixture.events.crossSchool,
      ]),
    );

    await expectEventDetailStatus({
      path: `/teacher/calendar/events/${fixture.events.unrelatedStage}`,
      auth: fixture.teacher.auth,
      status: 404,
    });
    await expectEventDetailStatus({
      path: `/teacher/calendar/events/${fixture.events.unrelatedGrade}`,
      auth: fixture.teacher.auth,
      status: 404,
    });
    await expectEventDetailStatus({
      path: `/teacher/calendar/events/${fixture.events.unrelatedSection}`,
      auth: fixture.teacher.auth,
      status: 404,
    });
    await expectEventDetailStatus({
      path: `/teacher/calendar/events/${fixture.events.crossSchool}`,
      auth: fixture.teacher.auth,
      status: 404,
    });
  });

  it('enforces student calendar visibility by current enrollment academic context', async () => {
    const response = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/calendar/events`)
      .query(CURRENT_RANGE_QUERY)
      .set('Authorization', bearer(fixture.student.auth))
      .expect(200);

    const ids = extractCalendarItemIds(response.body);
    expect(ids).toEqual(
      expect.arrayContaining([
        fixture.events.school,
        fixture.events.stage,
        fixture.events.grade,
        fixture.events.section,
      ]),
    );
    expect(ids).not.toEqual(
      expect.arrayContaining([
        fixture.events.unrelatedStage,
        fixture.events.unrelatedGrade,
        fixture.events.unrelatedSection,
        fixture.events.crossSchool,
        fixture.events.otherAcademicSameSection,
      ]),
    );

    for (const eventId of [
      fixture.events.unrelatedSection,
      fixture.events.unrelatedGrade,
      fixture.events.unrelatedStage,
      fixture.events.crossSchool,
      fixture.events.otherAcademicSameSection,
    ]) {
      await expectEventDetailStatus({
        path: `/student/calendar/events/${eventId}`,
        auth: fixture.student.auth,
        status: 404,
      });
    }
  });

  it('enforces parent child ownership before child calendar access', async () => {
    const ownedPath = `/parent/children/${fixture.ownedChildStudentId}/calendar/events`;
    const response = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}${ownedPath}`)
      .query(CURRENT_RANGE_QUERY)
      .set('Authorization', bearer(fixture.parent.auth))
      .expect(200);

    const ids = extractCalendarItemIds(response.body);
    expect(ids).toEqual(
      expect.arrayContaining([
        fixture.events.school,
        fixture.events.stage,
        fixture.events.grade,
        fixture.events.section,
      ]),
    );
    expect(ids).not.toEqual(
      expect.arrayContaining([
        fixture.events.unrelatedStage,
        fixture.events.unrelatedGrade,
        fixture.events.unrelatedSection,
        fixture.events.crossSchool,
        fixture.events.otherAcademicSameSection,
      ]),
    );

    await request(fixture.app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${fixture.nonOwnedChildStudentId}/calendar/events`,
      )
      .query(CURRENT_RANGE_QUERY)
      .set('Authorization', bearer(fixture.parent.auth))
      .expect(404);

    await request(fixture.app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${fixture.crossSchoolStudentId}/calendar/events`,
      )
      .query(CURRENT_RANGE_QUERY)
      .set('Authorization', bearer(fixture.parent.auth))
      .expect(404);

    for (const eventId of [
      fixture.events.unrelatedSection,
      fixture.events.crossSchool,
      fixture.events.otherAcademicSameSection,
    ]) {
      await expectEventDetailStatus({
        path: `${ownedPath}/${eventId}`,
        auth: fixture.parent.auth,
        status: 404,
      });
    }
  });

  it('does not leak tenant, actor, soft-delete, notes, or raw Prisma fields', async () => {
    const listRequests = [
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

    for (const actor of listRequests) {
      const list = await request(fixture.app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${actor.path}`)
        .query(CURRENT_RANGE_QUERY)
        .set('Authorization', bearer(actor.auth))
        .expect(200);
      expectNoHiddenAppCalendarFields(list.body);

      const detail = await request(fixture.app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${actor.path}/${fixture.events.school}`)
        .set('Authorization', bearer(actor.auth))
        .expect(200);
      expectNoHiddenAppCalendarFields(detail.body);
    }
  });

  it('excludes soft-deleted app-visible events from every app surface', async () => {
    const actorRequests = [
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

    for (const actor of actorRequests) {
      const list = await request(fixture.app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${actor.path}`)
        .query(CURRENT_RANGE_QUERY)
        .set('Authorization', bearer(actor.auth))
        .expect(200);
      expect(extractCalendarItemIds(list.body)).not.toContain(
        fixture.events.softDeleted,
      );

      await expectEventDetailStatus({
        path: `${actor.path}/${fixture.events.softDeleted}`,
        auth: actor.auth,
        status: 404,
      });
    }
  });

  it('rejects app user calendar mutations on app routes and school-dashboard calendar CRUD', async () => {
    const actorMutations = [
      {
        listPath: '/teacher/calendar/events',
        detailPath: `/teacher/calendar/events/${fixture.events.school}`,
        auth: fixture.teacher.auth,
      },
      {
        listPath: '/student/calendar/events',
        detailPath: `/student/calendar/events/${fixture.events.school}`,
        auth: fixture.student.auth,
      },
      {
        listPath: `/parent/children/${fixture.ownedChildStudentId}/calendar/events`,
        detailPath: `/parent/children/${fixture.ownedChildStudentId}/calendar/events/${fixture.events.school}`,
        auth: fixture.parent.auth,
      },
    ];

    for (const actor of actorMutations) {
      await request(fixture.app.getHttpServer())
        .post(`${GLOBAL_PREFIX}${actor.listPath}`)
        .set('Authorization', bearer(actor.auth))
        .send({})
        .expect(404);

      await request(fixture.app.getHttpServer())
        .patch(`${GLOBAL_PREFIX}${actor.detailPath}`)
        .set('Authorization', bearer(actor.auth))
        .send({})
        .expect(404);

      await request(fixture.app.getHttpServer())
        .delete(`${GLOBAL_PREFIX}${actor.detailPath}`)
        .set('Authorization', bearer(actor.auth))
        .expect(404);

      await expectSchoolDashboardCalendarMutationsForbidden(actor.auth);
    }
  });

  async function expectEventDetailStatus(params: {
    path: string;
    auth: AuthTokens;
    status: number;
  }): Promise<void> {
    await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}${params.path}`)
      .set('Authorization', bearer(params.auth))
      .expect(params.status)
      .expect((response) => {
        expectNoHiddenAppCalendarFields(response.body);
      });
  }

  async function expectSchoolDashboardCalendarMutationsForbidden(
    auth: AuthTokens,
  ): Promise<void> {
    const createBody = {
      academicYearId: fixture.academicA.academicYearId,
      termId: fixture.academicA.termId,
      title: 'Forbidden app mutation',
      type: 'holiday',
      scopeType: 'school',
      allDay: true,
      startDate: '2026-10-20T00:00:00.000Z',
      endDate: '2026-10-20T23:59:59.000Z',
    };

    await request(fixture.app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(auth))
      .send(createBody)
      .expect(403);

    await request(fixture.app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/calendar/events/${fixture.events.school}`)
      .set('Authorization', bearer(auth))
      .send({ title: 'Forbidden app update' })
      .expect(403);

    await request(fixture.app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/calendar/events/${fixture.events.school}`)
      .set('Authorization', bearer(auth))
      .expect(403);
  }
});

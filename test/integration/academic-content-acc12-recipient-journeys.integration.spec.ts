import { randomUUID } from 'node:crypto';
import {
  AcademicContentACC12JourneyFixture,
  JourneyContent,
  JourneyDetail,
  JourneyPublication,
} from '../fixtures/academic-content-acc12-journey.fixture';
import {
  ACADEMIC_CONTENT_PUBLICATION_QUEUE,
  academicContentPublicationJobId,
} from '../../src/modules/academics/academic-content/domain/academic-content-publication-runtime.constants';
import {
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
  buildAcademicContentNotificationGenerationJobId,
  buildAcademicContentSessionReminderJobId,
} from '../../src/modules/communication/domain/communication-notification-generation-domain';
import type { AcademicContentAcknowledgementResponseDto } from '../../src/modules/academics/academic-content/dto/academic-content-acknowledgement.dto';
import type { TeacherAcademicContentAnalyticsResponseDto } from '../../src/modules/teacher-app/academic-content/dto/teacher-academic-content-analytics.dto';

describe('ACC-12 composed recipient journeys with real publication and notification consumption', () => {
  jest.setTimeout(120_000);
  const f = new AcademicContentACC12JourneyFixture();
  beforeAll(() => f.start());
  afterAll(() => f.stop());
  async function publish(id: string, teacher = false) {
    const intent = await f.http<JourneyPublication>(
      'post',
      `${teacher ? 'teacher' : 'academics'}/academic-content/${id}/publications`,
      teacher ? 'teacher' : 'school',
      { clientRequestId: randomUUID() },
    );
    const identity = {
      schoolId: f.school.schoolId,
      contentId: id,
      publicationId: intent.body.publicationId,
    };
    await f.completed(
      ACADEMIC_CONTENT_PUBLICATION_QUEUE,
      academicContentPublicationJobId('publish', identity),
    );
    await f.completed(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      buildAcademicContentNotificationGenerationJobId(identity),
    );
    return intent.body;
  }
  async function noImplicitWrites(id: string) {
    expect(
      await f.prisma.academicContentEngagementEvent.count({
        where: { academicContentId: id },
      }),
    ).toBe(0);
    expect(
      await f.prisma.academicContentAcknowledgement.count({
        where: { academicContentId: id },
      }),
    ).toBe(0);
  }

  it('J3: one Teacher Weekly Plan is consumed by Student and Parent, explicitly reported and counted by owner analytics', async () => {
    const created = await f.http<JourneyContent>(
      'post',
      `teacher/classes/${f.allocationId}/academic-content`,
      'teacher',
      {
        type: 'WEEKLY_PLAN',
        audience: 'STUDENTS_AND_GUARDIANS',
        title: 'ACC12 weekly plan',
      },
    );
    const id = created.body.id;
    const date = new Date().toISOString().slice(0, 10);
    await f.http(
      'put',
      `teacher/academic-content/${id}/details/weekly-plan`,
      'teacher',
      {
        weekStartDate: date,
        weekEndDate: date,
        objectives: ['Learn'],
        topics: ['Topic'],
        homeworkAssignmentIds: [],
        gradeAssessmentIds: [],
      },
    );
    const publication = await publish(id, true);
    for (const [path, actor] of [
      [`student/academic-content/${id}`, 'student'],
      [f.parentPath(id), 'parent'],
    ] as const) {
      const detail = await f.http<JourneyDetail>('get', path, actor);
      expect(detail.body.content.publicationId).toBe(publication.publicationId);
      expect(detail.headers['cache-control']).toBe(
        'no-store, private, max-age=0',
      );
    }
    await noImplicitWrites(id);
    await f.http(
      'get',
      `student/academic-content/${id}`,
      'foreignStudent',
      undefined,
      404,
    );
    await f.http(
      'get',
      f.parentPath(id, f.prerequisites.children[2].studentId),
      'parent',
      undefined,
      404,
    );
    for (const [path, actor] of [
      [`student/academic-content/${id}`, 'student'],
      [f.parentPath(id), 'parent'],
    ] as const) {
      await f.http(
        'post',
        `${path}/engagement-events`,
        actor,
        {
          expectedPublicationId: randomUUID(),
          clientRequestId: randomUUID(),
          eventType: 'CONTENT_VIEWED',
        },
        404,
      );
      await f.http(
        'post',
        `${path}/engagement-events`,
        actor,
        {
          expectedPublicationId: publication.publicationId,
          clientRequestId: randomUUID(),
          eventType: 'CONTENT_VIEWED',
        },
        200,
      );
    }
    const analytics = await f.http<TeacherAcademicContentAnalyticsResponseDto>(
      'get',
      `teacher/academic-content/${id}/publications/${publication.publicationId}/analytics?range=7d`,
      'teacher',
    );
    expect(analytics.body.metrics).toMatchObject({
      totalEventReports: '2',
      distinctStudentActorsEngaged: '1',
      distinctParentChildPairsEngaged: '1',
      acknowledgementRecords: '0',
    });
    expect(
      analytics.body.metrics.eventCountsByTypeAndActorKind.filter(
        (c) => c.count !== '0',
      ),
    ).toEqual(
      expect.arrayContaining([
        { eventType: 'CONTENT_VIEWED', actorKind: 'STUDENT', count: '1' },
        { eventType: 'CONTENT_VIEWED', actorKind: 'PARENT', count: '1' },
      ]),
    );
    await f.http(
      'get',
      `teacher/academic-content/${id}/analytics`,
      'school',
      undefined,
      403,
    );
  });

  it('J4: notification/detail reads leave required ACK pending; explicit retry is durable and successor has a new obligation', async () => {
    const root = 'academics/academic-content';
    const created = await f.http<JourneyContent>('post', root, 'school', {
      academicYearId: f.school.yearId,
      termId: f.school.termId,
      type: 'GUARDIAN_WEEKLY_NOTE',
      audience: 'GUARDIANS',
      title: 'Required note',
    });
    const id = created.body.id;
    await f.http('put', `${root}/${id}/targets`, 'school', {
      targets: [{ scopeType: 'CLASSROOM', classroomId: f.school.classroomId }],
    });
    await f.http('put', `${root}/${id}/details/guardian-note`, 'school', {
      body: 'First note',
      priority: 'NORMAL',
      requiresAcknowledgement: true,
    });
    const first = await publish(id),
      path = `${f.parentPath(id)}/acknowledgement`;
    const notification =
      await f.prisma.communicationNotification.findFirstOrThrow({
        where: {
          schoolId: f.school.schoolId,
          recipientUserId: f.prerequisites.parentId,
          metadata: { path: ['publicationId'], equals: first.publicationId },
        },
      });
    await f.http('get', `parent/notifications/${notification.id}`, 'parent');
    await f.http(
      'post',
      `parent/notifications/${notification.id}/read`,
      'parent',
    );
    await f.http('get', f.parentPath(id), 'parent');
    const pending = await f.http<AcademicContentAcknowledgementResponseDto>(
      'get',
      `${path}?expectedPublicationId=${first.publicationId}`,
      'parent',
    );
    expect(pending.body.status).toBe('PENDING');
    await noImplicitWrites(id);
    await f.http(
      'post',
      path,
      'student',
      { expectedPublicationId: first.publicationId },
      403,
    );
    await f.http(
      'post',
      `${f.parentPath(id, f.prerequisites.children[2].studentId)}/acknowledgement`,
      'parent',
      { expectedPublicationId: first.publicationId },
      404,
    );
    const accepted = await f.http<AcademicContentAcknowledgementResponseDto>(
      'post',
      path,
      'parent',
      { expectedPublicationId: first.publicationId },
      200,
    );
    const retry = await f.http<AcademicContentAcknowledgementResponseDto>(
      'post',
      path,
      'parent',
      { expectedPublicationId: first.publicationId },
      200,
    );
    expect(retry.body).toEqual(accepted.body);
    expect(accepted.body.status).toBe('ACKNOWLEDGED');
    const historical =
      await f.prisma.academicContentAcknowledgement.findUniqueOrThrow({
        where: { id: accepted.body.acknowledgementId! },
      });
    await f.http(
      'post',
      `${root}/${id}/publications/${first.publicationId}/revise`,
      'school',
      {},
      200,
    );
    await f.http('put', `${root}/${id}/details/guardian-note`, 'school', {
      body: 'Successor note',
      priority: 'NORMAL',
      requiresAcknowledgement: true,
    });
    const successor = await publish(id);
    const current = await f.http<AcademicContentAcknowledgementResponseDto>(
      'get',
      `${path}?expectedPublicationId=${successor.publicationId}`,
      'parent',
    );
    expect(current.body).toMatchObject({
      status: 'PENDING',
      acknowledgementId: null,
      publicationId: successor.publicationId,
    });
    await f.http(
      'post',
      path,
      'parent',
      { expectedPublicationId: first.publicationId },
      404,
    );
    expect(
      await f.prisma.academicContentAcknowledgement.findUniqueOrThrow({
        where: { id: historical.id },
      }),
    ).toEqual(historical);
  });

  it('J5: a genuinely delayed session reminder is consumed only when eligible; join reports never mutate Attendance', async () => {
    const root = 'academics/academic-content';
    await f.http('patch', `${root}/settings/notification-policy`, 'school', {
      onlineSessionRemindersEnabled: true,
      onlineSessionReminderOffsetsMinutes: [5],
    });
    const created = await f.http<JourneyContent>(
      'post',
      `teacher/classes/${f.allocationId}/academic-content`,
      'teacher',
      {
        type: 'ONLINE_SESSION',
        audience: 'STUDENTS_AND_GUARDIANS',
        title: 'Session',
      },
    );
    const id = created.body.id,
      startAt = Date.now() + 5 * 60_000 + 15_000,
      dueAt = startAt - 5 * 60_000;
    await f.http(
      'put',
      `teacher/academic-content/${id}/details/online-session`,
      'teacher',
      {
        platform: 'ZOOM',
        joinUrl: 'https://zoom.us/j/acc12',
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(startAt + 30 * 60_000).toISOString(),
        timezone: 'Africa/Cairo',
      },
    );
    const publication = await publish(id, true);
    const jobId = buildAcademicContentSessionReminderJobId({
      schoolId: f.school.schoolId,
      publicationId: publication.publicationId,
      reminderOffsetMinutes: 5,
    });
    const delayed = await f.queues
      .getQueue(COMMUNICATION_NOTIFICATION_QUEUE_NAME)
      .getJob(jobId);
    expect(delayed).toBeDefined();
    expect(await delayed!.getState()).toBe('delayed');
    expect(Date.now()).toBeLessThan(dueAt);
    const reminderWhere = {
      schoolId: f.school.schoolId,
      AND: [
        {
          metadata: {
            path: ['publicationId'],
            equals: publication.publicationId,
          },
        },
        {
          metadata: { path: ['eventType'], equals: 'online_session_reminder' },
        },
      ],
    };
    expect(
      await f.prisma.communicationNotification.count({ where: reminderWhere }),
    ).toBe(0);
    const attendanceBefore = await f.prisma.attendanceEntry.count({
      where: { schoolId: f.school.schoolId },
    });
    const attendanceSessionsBefore = await f.prisma.attendanceSession.count({
      where: { schoolId: f.school.schoolId },
    });
    const consumed = await f.completed(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      jobId,
      35_000,
    );
    expect(consumed.processedOn).toBeGreaterThanOrEqual(dueAt);
    const reminders = await f.prisma.communicationNotification.findMany({
      where: reminderWhere,
    });
    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.every((r) => r.createdAt.getTime() >= dueAt)).toBe(true);
    const detail = await f.http<JourneyDetail>(
      'get',
      `student/academic-content/${id}`,
      'student',
    );
    expect(detail.body.content.details?.joinUrl).toBe(
      'https://zoom.us/j/acc12',
    );
    await f.http(
      'post',
      `student/academic-content/${id}/engagement-events`,
      'student',
      {
        expectedPublicationId: randomUUID(),
        clientRequestId: randomUUID(),
        eventType: 'JOIN_LINK_CLICKED',
      },
      404,
    );
    await f.http(
      'post',
      `student/academic-content/${id}/engagement-events`,
      'student',
      {
        expectedPublicationId: publication.publicationId,
        clientRequestId: randomUUID(),
        eventType: 'JOIN_LINK_CLICKED',
      },
      200,
    );
    expect(
      await f.prisma.attendanceEntry.count({
        where: { schoolId: f.school.schoolId },
      }),
    ).toBe(attendanceBefore);
    expect(
      await f.prisma.attendanceSession.count({
        where: { schoolId: f.school.schoolId },
      }),
    ).toBe(attendanceSessionsBefore);
  });
});

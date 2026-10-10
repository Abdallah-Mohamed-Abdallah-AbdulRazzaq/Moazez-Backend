import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  AcademicContentACC12JourneyFixture,
  JourneyContent,
  JourneyPublication,
} from '../fixtures/academic-content-acc12-journey.fixture';
import {
  ACADEMIC_CONTENT_PUBLICATION_QUEUE,
  academicContentPublicationJobId,
} from '../../src/modules/academics/academic-content/domain/academic-content-publication-runtime.constants';
import { AcademicContentEngagementService } from '../../src/modules/academics/academic-content/application/academic-content-engagement.service';
import { AcademicContentAcknowledgementService } from '../../src/modules/academics/academic-content/application/academic-content-acknowledgement.service';
import { TeacherAcademicContentAnalyticsUseCase } from '../../src/modules/teacher-app/academic-content/application/teacher-academic-content-analytics.use-case';
import type { AcademicContentAcknowledgementResponseDto } from '../../src/modules/academics/academic-content/dto/academic-content-acknowledgement.dto';

type Signal = {
  event: string;
  outcome: string;
  requestId: string;
  durationMs?: number;
};
describe('ACC-12 OBS-02 signals preserve guarded HTTP, durable retry and sanitized failures', () => {
  jest.setTimeout(120_000);
  const f = new AcademicContentACC12JourneyFixture();
  const signals: Signal[] = [];
  let log: jest.SpyInstance;
  beforeAll(async () => {
    await f.start();
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        if (
          message &&
          typeof message === 'object' &&
          'event' in message &&
          typeof message.event === 'string' &&
          [
            'academic_content.engagement',
            'academic_content.acknowledgement',
            'academic_content.teacher_analytics',
          ].includes(message.event)
        )
          signals.push(message as Signal);
      });
  });
  afterAll(async () => {
    log?.mockRestore();
    await f.stop();
  });

  it('proves accepted/denied/429/503, post-commit ACK retry truth, read-only GET, latency and redaction without response changes', async () => {
    const root = 'academics/academic-content';
    const created = await f.http<JourneyContent>('post', root, 'school', {
      academicYearId: f.school.yearId,
      termId: f.school.termId,
      type: 'GUARDIAN_WEEKLY_NOTE',
      audience: 'GUARDIANS',
      title: 'PRIVATE_NOTE_TITLE_SENTINEL',
    });
    const id = created.body.id;
    await f.http('put', `${root}/${id}/targets`, 'school', {
      targets: [{ scopeType: 'CLASSROOM', classroomId: f.school.classroomId }],
    });
    await f.http('put', `${root}/${id}/details/guardian-note`, 'school', {
      body: 'PRIVATE_NOTE_BODY_SENTINEL',
      priority: 'NORMAL',
      requiresAcknowledgement: true,
    });
    const publication = await f.http<JourneyPublication>(
      'post',
      `${root}/${id}/publications`,
      'school',
      { clientRequestId: randomUUID() },
    );
    await f.completed(
      ACADEMIC_CONTENT_PUBLICATION_QUEUE,
      academicContentPublicationJobId('publish', {
        schoolId: f.school.schoolId,
        contentId: id,
        publicationId: publication.body.publicationId,
      }),
    );
    const ackPath = `${f.parentPath(id)}/acknowledgement`,
      ackBody = { expectedPublicationId: publication.body.publicationId };
    signals.length = 0;
    const pending = await f.http<AcademicContentAcknowledgementResponseDto>(
      'get',
      `${ackPath}?expectedPublicationId=${ackBody.expectedPublicationId}`,
      'parent',
    );
    expect(pending.body.status).toBe('PENDING');
    expect(signals).toEqual([]);
    const first = await f.http<AcademicContentAcknowledgementResponseDto>(
      'post',
      ackPath,
      'parent',
      ackBody,
      200,
    );
    expect(signals.at(-1)).toMatchObject({
      event: 'academic_content.acknowledgement',
      outcome: 'accepted',
    });
    expect(
      await f.prisma.academicContentAcknowledgement.count({
        where: { id: first.body.acknowledgementId! },
      }),
    ).toBe(1);
    const retry = await f.http<AcademicContentAcknowledgementResponseDto>(
      'post',
      ackPath,
      'parent',
      ackBody,
      200,
    );
    expect(retry.body).toEqual(first.body);
    expect(Object.keys(first.body).sort()).toEqual([
      'acknowledgedAt',
      'acknowledgementId',
      'publicationId',
      'requiresAcknowledgement',
      'revisionId',
      'status',
    ]);
    expect(signals.at(-1)).toMatchObject({
      event: 'academic_content.acknowledgement',
      outcome: 'identical_retry',
    });
    const writes = signals.length;
    await f.http(
      'get',
      `${ackPath}?expectedPublicationId=${ackBody.expectedPublicationId}`,
      'parent',
    );
    expect(signals).toHaveLength(writes);
    await f.http(
      'post',
      ackPath,
      'parent',
      { expectedPublicationId: randomUUID() },
      404,
    );
    expect(signals.at(-1)).toMatchObject({
      event: 'academic_content.acknowledgement',
      outcome: 'denied',
    });

    const resource = await f.http<JourneyContent>(
      'post',
      `teacher/classes/${f.allocationId}/academic-content`,
      'teacher',
      {
        type: 'GENERAL_RESOURCE',
        audience: 'STUDENTS_AND_GUARDIANS',
        title: 'PRIVATE_RESOURCE_TITLE_SENTINEL',
      },
    );
    const resourceId = resource.body.id;
    await f.http(
      'put',
      `teacher/academic-content/${resourceId}/links`,
      'teacher',
      {
        links: [
          {
            label: 'PRIVATE_LABEL_SENTINEL',
            url: 'https://example.org/PRIVATE_URL_SENTINEL',
          },
        ],
      },
    );
    const published = await f.http<JourneyPublication>(
      'post',
      `teacher/academic-content/${resourceId}/publications`,
      'teacher',
      { clientRequestId: randomUUID() },
    );
    await f.completed(
      ACADEMIC_CONTENT_PUBLICATION_QUEUE,
      academicContentPublicationJobId('publish', {
        schoolId: f.school.schoolId,
        contentId: resourceId,
        publicationId: published.body.publicationId,
      }),
    );
    const eventPath = `student/academic-content/${resourceId}/engagement-events`,
      eventBody = {
        expectedPublicationId: published.body.publicationId,
        clientRequestId: randomUUID(),
        eventType: 'CONTENT_VIEWED',
      };
    await f.http('post', eventPath, 'student', eventBody, 200);
    expect(signals.at(-1)).toMatchObject({
      event: 'academic_content.engagement',
      outcome: 'accepted',
    });
    await f.http(
      'post',
      eventPath,
      'student',
      { ...eventBody, expectedPublicationId: randomUUID() },
      404,
    );
    expect(signals.at(-1)).toMatchObject({
      event: 'academic_content.engagement',
      outcome: 'denied',
    });

    // Exhaust the actual shared Parent quota using identical HTTP retries, not seeded admission rows.
    const admission =
      await f.prisma.academicContentEngagementAdmission.findFirstOrThrow({
        where: {
          schoolId: f.school.schoolId,
          actorUserId: f.prerequisites.parentId,
        },
      });
    for (let n = admission.requestCount; n < 60; n++)
      await f.http('post', ackPath, 'parent', ackBody, 200);
    const limited = await f.http('post', ackPath, 'parent', ackBody, 429);
    expect(limited.headers['retry-after']).toBe('60');
    expect(limited.body).toMatchObject({
      error: { code: 'rate_limit.exceeded' },
    });
    expect(signals.at(-1)).toMatchObject({
      event: 'academic_content.acknowledgement',
      outcome: 'rate_limited',
    });
    const shared = await f.http(
      'post',
      `${f.parentPath(resourceId)}/engagement-events`,
      'parent',
      { ...eventBody, clientRequestId: randomUUID() },
      429,
    );
    expect(shared.headers['retry-after']).toBe('60');
    expect(signals.at(-1)).toMatchObject({
      event: 'academic_content.engagement',
      outcome: 'rate_limited',
    });
    const privateFailure = new Error(
      'PRIVATE_SQL_SENTINEL SELECT secret, JWT, device, file_key, student_id',
    );
    for (const [path, actor, body, event] of [
      [ackPath, 'parent', ackBody, 'academic_content.acknowledgement'],
      [eventPath, 'student', eventBody, 'academic_content.engagement'],
    ] as const) {
      const failure = jest
        .spyOn(f.prisma, '$transaction')
        .mockRejectedValueOnce(privateFailure);
      const unavailable = await f.http('post', path, actor, body, 503);
      failure.mockRestore();
      expect(unavailable.body).toMatchObject({
        error: { code: 'service_unavailable' },
      });
      expect(JSON.stringify(unavailable.body)).not.toContain(
        'PRIVATE_SQL_SENTINEL',
      );
      expect(signals.at(-1)).toMatchObject({ event, outcome: 'unavailable' });
    }
    const analyticsPath = `teacher/academic-content/${resourceId}/analytics?range=7d`;
    await f.http('get', analyticsPath, 'teacher');
    expect(signals.at(-1)).toMatchObject({
      event: 'academic_content.teacher_analytics',
      outcome: 'success',
    });
    await f.http(
      'get',
      `teacher/academic-content/${randomUUID()}/analytics`,
      'teacher',
      undefined,
      404,
    );
    expect(signals.at(-1)).toMatchObject({
      event: 'academic_content.teacher_analytics',
      outcome: 'denied',
    });
    const failedQuery = jest
      .spyOn(f.prisma, '$transaction')
      .mockRejectedValueOnce(privateFailure);
    const failed = await f.http(
      'get',
      analyticsPath,
      'teacher',
      undefined,
      500,
    );
    failedQuery.mockRestore();
    expect(failed.body).toMatchObject({ error: { code: 'internal_error' } });
    expect(signals.at(-1)).toMatchObject({
      event: 'academic_content.teacher_analytics',
      outcome: 'failed',
    });
    for (const signal of signals.filter(
      (s) => s.event === 'academic_content.teacher_analytics',
    )) {
      expect(Number.isFinite(signal.durationMs)).toBe(true);
      expect(signal.durationMs).toBeGreaterThanOrEqual(0);
    }
    for (const signal of signals)
      expect(Object.keys(signal).sort()).toEqual(
        signal.durationMs === undefined
          ? ['event', 'outcome', 'requestId']
          : ['durationMs', 'event', 'outcome', 'requestId'],
      );
    const serialized = JSON.stringify(signals);
    for (const privateValue of [
      ...f.prerequisites.users,
      ...f.prerequisites.schools.map((s) => s.schoolId),
      f.teacherId,
      f.child.studentId,
      eventBody.clientRequestId,
      id,
      resourceId,
      'PRIVATE_',
      'Bearer',
      'secret',
    ])
      expect(serialized).not.toContain(privateValue);

    // Sink failures are isolated after commit; real response/transaction behavior remains identical.
    for (const service of [
      f.api.get(AcademicContentAcknowledgementService),
      f.api.get(AcademicContentEngagementService),
      f.api.get(TeacherAcademicContentAnalyticsUseCase),
    ]) {
      const logger = (service as unknown as { logger: Logger }).logger;
      const brokenSink = jest.spyOn(logger, 'log').mockImplementation(() => {
        throw new Error('fixture_sink_failure');
      });
      if (service instanceof AcademicContentAcknowledgementService) {
        await f.prerequisites.resetAdmission();
        expect(
          (
            await f.http<AcademicContentAcknowledgementResponseDto>(
              'post',
              ackPath,
              'parent',
              ackBody,
              200,
            )
          ).body,
        ).toEqual(first.body);
      } else if (service instanceof AcademicContentEngagementService)
        await f.http(
          'post',
          eventPath,
          'student',
          { ...eventBody, clientRequestId: randomUUID() },
          200,
        );
      else await f.http('get', analyticsPath, 'teacher');
      brokenSink.mockRestore();
    }
  });
});

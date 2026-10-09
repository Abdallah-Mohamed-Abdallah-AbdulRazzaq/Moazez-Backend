import { randomUUID } from 'node:crypto';
import {
  AcademicContentACC12JourneyFixture,
  JourneyContent,
  JourneyPublication,
} from '../fixtures/academic-content-acc12-journey.fixture';
import {
  ACADEMIC_CONTENT_PUBLICATION_QUEUE,
  academicContentPublicationJobId,
} from '../../src/modules/academics/academic-content/domain/academic-content-publication-runtime.constants';
import {
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
  buildAcademicContentReviewDecisionJobId,
} from '../../src/modules/communication/domain/communication-notification-generation-domain';
import type { AcademicContentTransitionResponseDto } from '../../src/modules/academics/academic-content/dto/academic-content-workflow.dto';
import type { TeacherNotificationsListResponseDto } from '../../src/modules/teacher-app/notifications/dto/teacher-notifications.dto';

describe('ACC-12 composed authoring and review through HTTP and registered consumers', () => {
  jest.setTimeout(120_000);
  const f = new AcademicContentACC12JourneyFixture();
  beforeAll(() => f.start());
  afterAll(() => f.stop());

  it('J1: School configuration and scheduled intent produce immutable facts only after real publication consumption', async () => {
    const root = 'academics/academic-content';
    const created = await f.http<JourneyContent>('post', root, 'school', {
      academicYearId: f.school.yearId,
      termId: f.school.termId,
      type: 'GENERAL_RESOURCE',
      audience: 'STUDENTS_AND_GUARDIANS',
      title: 'ACC12 School resource',
    });
    const id = created.body.id;
    await f.http('put', `${root}/${id}/targets`, 'school', {
      targets: [{ scopeType: 'CLASSROOM', classroomId: f.school.classroomId }],
    });
    await f.http('put', `${root}/${id}/links`, 'school', {
      links: [{ label: 'Source', url: 'https://example.org/acc12' }],
    });
    const ready = await f.http<{
      canPublish: boolean;
      blockingReasons: string[];
    }>('get', `${root}/${id}/publication-readiness`);
    expect(ready.body).toMatchObject({ canPublish: true, blockingReasons: [] });
    await f.http('get', `${root}/${id}`, 'student', undefined, 403);
    await f.http(
      'post',
      `${root}/${id}/publications`,
      'teacher',
      { clientRequestId: randomUUID() },
      403,
    );
    expect(
      await f.prisma.academicContentPublication.count({
        where: { academicContentId: id },
      }),
    ).toBe(0);
    const intent = await f.http<JourneyPublication>(
      'post',
      `${root}/${id}/publications`,
      'school',
      {
        clientRequestId: randomUUID(),
        publishAt: new Date(Date.now() + 1000).toISOString(),
      },
    );
    const identity = {
      schoolId: f.school.schoolId,
      contentId: id,
      publicationId: intent.body.publicationId,
    };
    const job = await f.completed(
      ACADEMIC_CONTENT_PUBLICATION_QUEUE,
      academicContentPublicationJobId('publish', identity),
    );
    expect(job.processedOn).toBeGreaterThanOrEqual(job.timestamp + job.delay);
    expect(job.finishedOn).toBeGreaterThanOrEqual(job.processedOn!);
    const publication =
      await f.prisma.academicContentPublication.findUniqueOrThrow({
        where: { id: identity.publicationId },
        include: {
          revision: { include: { targets: true, links: true } },
          recipients: true,
        },
      });
    expect(publication.status).toBe('PUBLISHED');
    expect(job.processedOn).toBeGreaterThanOrEqual(
      publication.publishAt.getTime(),
    );
    expect(publication.revision.id).toBe(intent.body.revisionId);
    expect(publication.revision.links).toHaveLength(1);
    expect(publication.revision.targets).toHaveLength(1);
    expect(publication.studentRecipientCount).toBe(2);
    expect(publication.recipients.length).toBeGreaterThan(2);
  });

  it('J2: Teacher submit/change/resubmit/School approve retains two rounds and actual decision notifications', async () => {
    const management = 'academics/academic-content';
    await f.http('patch', `${management}/settings/workflow-policy`, 'school', {
      preparationApprovalRequired: true,
    });
    const created = await f.http<JourneyContent>(
      'post',
      `teacher/classes/${f.allocationId}/academic-content`,
      'teacher',
      {
        type: 'TEACHER_PREPARATION',
        audience: 'INTERNAL_STAFF',
        title: 'First submitted title',
      },
    );
    const id = created.body.id,
      teacherPath = `teacher/academic-content/${id}`;
    await f.http('put', `${teacherPath}/details/preparation`, 'teacher', {
      topic: 'First topic',
      objectives: ['Objective'],
      learningOutcomes: [],
      teachingStrategies: [],
      activities: [],
    });
    const first = await f.http<AcademicContentTransitionResponseDto>(
      'post',
      `${teacherPath}/submit`,
      'teacher',
      {},
      200,
    );
    await f.http('post', `${management}/${id}/approve`, 'teacher', {}, 403);
    const deniedPublish = await f.http(
      'post',
      `${teacherPath}/publications`,
      'teacher',
      { clientRequestId: randomUUID() },
      409,
    );
    expect(deniedPublish.body).toHaveProperty('error');
    const changes = await f.http<AcademicContentTransitionResponseDto>(
      'post',
      `${management}/${id}/request-changes`,
      'school',
      { note: 'Revise objective' },
      200,
    );
    expect(changes.body.approvalId).toBe(first.body.approvalId);
    await f.completed(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      buildAcademicContentReviewDecisionJobId({
        schoolId: f.school.schoolId,
        approvalId: first.body.approvalId,
      }),
    );
    const firstRevision =
      await f.prisma.academicContentRevision.findUniqueOrThrow({
        where: { id: first.body.revisionId },
      });
    await f.http('patch', teacherPath, 'teacher', {
      title: 'Second submitted title',
    });
    await f.http('put', `${teacherPath}/details/preparation`, 'teacher', {
      topic: 'Second topic',
      objectives: ['Revised objective'],
      learningOutcomes: [],
      teachingStrategies: [],
      activities: [],
    });
    const second = await f.http<AcademicContentTransitionResponseDto>(
      'post',
      `${teacherPath}/submit`,
      'teacher',
      {},
      200,
    );
    expect(second.body.roundNumber).toBe(2);
    expect(second.body.revisionId).not.toBe(first.body.revisionId);
    await f.http('post', `${management}/${id}/approve`, 'school', {}, 200);
    await f.completed(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      buildAcademicContentReviewDecisionJobId({
        schoolId: f.school.schoolId,
        approvalId: second.body.approvalId,
      }),
    );
    expect(
      await f.prisma.academicContentRevision.findUniqueOrThrow({
        where: { id: first.body.revisionId },
      }),
    ).toEqual(firstRevision);
    const rounds = await f.prisma.academicContentApproval.findMany({
      where: { academicContentId: id },
      orderBy: { roundNumber: 'asc' },
    });
    expect(rounds.map((r) => r.status)).toEqual([
      'CHANGES_REQUESTED',
      'APPROVED',
    ]);
    expect(
      rounds.every((r) => r.decidedByUserId === f.prerequisites.authorId),
    ).toBe(true);
    const inbox = await f.http<TeacherNotificationsListResponseDto>(
      'get',
      'teacher/notifications',
      'teacher',
    );
    const decisions = await f.prisma.communicationNotification.findMany({
      where: { schoolId: f.school.schoolId, recipientUserId: f.teacherId },
    });
    expect(decisions).toHaveLength(2);
    for (const notification of decisions) {
      expect(inbox.body.notifications.map((n) => n.notificationId)).toContain(
        notification.id,
      );
      await f.http(
        'get',
        `teacher/notifications/${notification.id}`,
        'teacher',
      );
      await f.http(
        'get',
        `teacher/notifications/${notification.id}`,
        'student',
        undefined,
        403,
      );
    }
  });
});

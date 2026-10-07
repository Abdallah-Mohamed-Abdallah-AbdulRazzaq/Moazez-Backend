import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceRecipientKind as Kind,
  AcademicContentAudienceType as Audience,
  AcademicContentType as Type,
  UserStatus,
  UserType,
} from '@prisma/client';
import { AcademicContentPublicationNotificationService } from '../application/academic-content-publication-notification.service';
import {
  AcademicContentPublicationNotificationRepository,
  AcademicContentPublishedNotificationSource,
} from '../infrastructure/academic-content-publication-notification.repository';
import { effectiveAcademicContentNotificationPolicy } from '../domain/academic-content-notification.policy';
import {
  publishedNotificationContextAllows,
  publishedNotificationPolicyAllows,
} from '../domain/academic-content-publication-notification.policy';
import { CommunicationNotificationGenerationService } from '../../../communication/application/communication-notification-generation.service';
import { CommunicationNotificationQueueService } from '../../../communication/application/communication-notification-queue.service';
import { CommunicationPreparedAcademicContentBatch } from '../../../communication/domain/communication-notification-generation-domain';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentPublicationWorker } from '../infrastructure/academic-content-publication.worker';

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const now = new Date('2026-10-04T00:00:00Z');
const defaults = effectiveAcademicContentNotificationPolicy();
const user = {
  status: UserStatus.ACTIVE,
  deletedAt: null,
  userType: UserType.PARENT,
};
const context = {
  recipientUserId: uuid(1),
  recipientKind: Kind.GUARDIAN,
  guardianCanReceiveNotifications: null,
};

function source(): AcademicContentPublishedNotificationSource {
  const id = randomUUID(),
    schoolId = randomUUID(),
    academicContentId = randomUUID(),
    revisionId = randomUUID();
  return {
    id,
    schoolId,
    academicContentId,
    revisionId,
    publishedAt: now,
    visibleFrom: now,
    visibleUntil: null,
    supersedesPublicationId: null,
    changeSignificance: null,
    notifyMinorUpdate: false,
    school: { organizationId: randomUUID() },
    revision: {
      id: revisionId,
      schoolId,
      academicContentId,
      snapshotContractVersion: 2,
      title: 'Frozen revision title',
      type: Type.GENERAL_RESOURCE,
      audience: Audience.STUDENTS_AND_GUARDIANS,
    },
    createdBy: {
      id: randomUUID(),
      userType: UserType.SCHOOL_USER,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
  };
}

describe('ACC-8B publication notification decisions', () => {
  it.each([
    [Type.WEEKLY_PLAN, 'weeklyPlanNotificationsEnabled'],
    [Type.GUARDIAN_WEEKLY_NOTE, 'guardianWeeklyNoteNotificationsEnabled'],
    [Type.SUBJECT_RESOURCE, 'subjectResourceNotificationsEnabled'],
    [Type.ONLINE_SESSION, 'onlineSessionNotificationsEnabled'],
    [Type.GENERAL_RESOURCE, 'generalResourceNotificationsEnabled'],
  ] as const)('applies the master and %s type gate', (type, field) => {
    expect(publishedNotificationPolicyAllows(type, defaults)).toBe(true);
    expect(
      publishedNotificationPolicyAllows(type, {
        ...defaults,
        notificationsEnabled: false,
      }),
    ).toBe(false);
    expect(
      publishedNotificationPolicyAllows(type, { ...defaults, [field]: false }),
    ).toBe(false);
  });
  it('never notifies Teacher Preparation', () => {
    expect(
      publishedNotificationPolicyAllows(Type.TEACHER_PREPARATION, defaults),
    ).toBe(false);
  });
  it.each([
    {
      label: 'null account',
      context: { ...context, recipientUserId: null },
      user,
    },
    { label: 'missing account', context, user: undefined },
    {
      label: 'inactive account',
      context,
      user: { ...user, status: UserStatus.DISABLED },
    },
    { label: 'deleted account', context, user: { ...user, deletedAt: now } },
    {
      label: 'Guardian explicit opt-out',
      context: { ...context, guardianCanReceiveNotifications: false },
      user,
    },
    {
      label: 'Guardian wrong current type',
      context,
      user: { ...user, userType: UserType.TEACHER },
    },
    {
      label: 'Student wrong current type',
      context: { ...context, recipientKind: Kind.STUDENT },
      user,
    },
  ])('skips $label without changing snapshot', (row) => {
    const before = structuredClone(row.context);
    expect(
      publishedNotificationContextAllows(
        row.context,
        row.user,
        defaults,
        Audience.STUDENTS_AND_GUARDIANS,
      ),
    ).toBe(false);
    expect(row.context).toEqual(before);
  });
  it('allows null Guardian preference and applies audience policy and frozen audience', () => {
    expect(
      publishedNotificationContextAllows(
        context,
        user,
        defaults,
        Audience.GUARDIANS,
      ),
    ).toBe(true);
    expect(
      publishedNotificationContextAllows(
        context,
        user,
        { ...defaults, guardianNotificationsEnabled: false },
        Audience.GUARDIANS,
      ),
    ).toBe(false);
    const student = { ...context, recipientKind: Kind.STUDENT };
    const studentUser = { ...user, userType: UserType.STUDENT };
    expect(
      publishedNotificationContextAllows(
        student,
        studentUser,
        defaults,
        Audience.STUDENTS,
      ),
    ).toBe(true);
    expect(
      publishedNotificationContextAllows(
        student,
        studentUser,
        { ...defaults, studentNotificationsEnabled: false },
        Audience.STUDENTS,
      ),
    ).toBe(false);
    expect(
      publishedNotificationContextAllows(
        context,
        user,
        defaults,
        Audience.STUDENTS,
      ),
    ).toBe(false);
    expect(
      publishedNotificationContextAllows(
        student,
        studentUser,
        defaults,
        Audience.INTERNAL_STAFF,
      ),
    ).toBe(false);
  });

  function harness(count = 2, parentChildren = 2) {
    const publication = source();
    const input = {
      schoolId: publication.schoolId,
      organizationId: publication.school.organizationId,
      contentId: publication.academicContentId,
      publicationId: publication.id,
      actorUserId: null,
      actorUserType: null,
    };
    const users = Array.from({ length: count }, (_, i) => ({
      ...user,
      id: uuid(i + 1),
      userType: i === 0 ? UserType.PARENT : UserType.STUDENT,
    }));
    let sequence = 1000;
    const contexts = users.flatMap((account) =>
      Array.from(
        { length: account.userType === UserType.PARENT ? parentChildren : 1 },
        () => ({
          ...context,
          recipientKind:
            account.userType === UserType.PARENT ? Kind.GUARDIAN : Kind.STUDENT,
          id: uuid(sequence++),
          recipientUserId: account.id,
          studentId: uuid(sequence + 10000),
        }),
      ),
    );
    const repository = {
      findSource: jest.fn().mockResolvedValue(publication),
      findSchedulingSource: jest.fn().mockResolvedValue(publication),
      findReminderSchedulingSource: jest.fn().mockResolvedValue(null),
      findPolicy: jest.fn().mockResolvedValue(null),
      listRecipientUsers: jest.fn((_source: unknown, after?: string) =>
        Promise.resolve(
          users
            .map((row) => row.id)
            .filter((id) => !after || id > after)
            .slice(0, 500),
        ),
      ),
      listCurrentUsers: jest.fn((ids: string[]) =>
        Promise.resolve(users.filter((row) => ids.includes(row.id))),
      ),
      listContexts: jest.fn((_source: unknown, ids: string[], after?: string) =>
        Promise.resolve(
          contexts
            .filter(
              (row) =>
                ids.includes(row.recipientUserId) && (!after || row.id > after),
            )
            .slice(0, 500),
        ),
      ),
      listRecoveryCandidates: jest.fn().mockResolvedValue([]),
      findLaterSource: jest.fn().mockResolvedValue(null),
      listCancellationRecoveryCandidates: jest.fn().mockResolvedValue([]),
      listReminderRecoveryCandidates: jest.fn().mockResolvedValue([]),
    };
    const generate = jest.fn(
      (batch: CommunicationPreparedAcademicContentBatch) =>
        Promise.resolve({
          recipientCount: batch.recipients.length,
          createdNotificationCount: batch.recipients.length,
        }),
    );
    const ensure = jest
      .fn<Promise<string>, [unknown, Date?, Date?]>()
      .mockResolvedValue('created');
    const service = new AcademicContentPublicationNotificationService(
      repository as unknown as AcademicContentPublicationNotificationRepository,
      {
        generateForAcademicContentPublicationBatch: generate,
      } as unknown as CommunicationNotificationGenerationService,
      {
        ensureAcademicContentPublishedNotifications: ensure,
      } as unknown as CommunicationNotificationQueueService,
    );
    return { publication, input, repository, generate, ensure, service };
  }
  it('schedules future visibility and recovers long-delayed due events deterministically', async () => {
    const h = harness();
    h.publication.visibleFrom = new Date(now.getTime() + 3 * 86400000);
    await h.service.ensureAfterPublicationCommit(h.input, now);
    expect(h.ensure.mock.calls[0]).toEqual([
      expect.objectContaining({ publicationId: h.input.publicationId }),
      h.publication.visibleFrom,
      now,
    ]);
    h.repository.listRecoveryCandidates.mockResolvedValue([
      h.publication,
    ] as never);
    await h.service.recover(h.publication.visibleFrom);
    expect(h.ensure.mock.calls[1][1]).toEqual(h.publication.visibleFrom);
    expect(h.ensure.mock.calls[1][2]).toEqual(h.publication.visibleFrom);
  });
  it.each([
    ['SIGNIFICANT', false, true],
    ['SIGNIFICANT', true, true],
    ['MINOR', true, true],
    ['MINOR', false, false],
  ] as const)(
    'UPDATED decision %s override=%s',
    async (changeSignificance, notifyMinorUpdate, expected) => {
      const h = harness(505, 501);
      Object.assign(h.publication, {
        supersedesPublicationId: randomUUID(),
        changeSignificance,
        notifyMinorUpdate,
      });
      await h.service.generate(h.input, now);
      expect(h.generate).toHaveBeenCalledTimes(expected ? 2 : 0);
      if (expected) {
        expect(
          h.generate.mock.calls.map(([batch]) => batch.recipients.length),
        ).toEqual([500, 5]);
        expect(h.generate.mock.calls[0][0]).toMatchObject({
          eventType: 'academic_content_updated',
          title: 'Academic content updated',
          body: 'Frozen revision title',
        });
        expect(
          h.generate.mock.calls[0][0].recipients[0].metadata.eventType,
        ).toBe('academic_content_updated');
      } else {
        expect(h.repository.listRecipientUsers).not.toHaveBeenCalled();
        h.repository.listRecoveryCandidates.mockResolvedValue([
          h.publication,
        ] as never);
        await h.service.ensureAfterPublicationCommit(h.input, now);
        await h.service.recover(now);
        expect(h.ensure).not.toHaveBeenCalled();
      }
    },
  );
  it.each([
    'notificationsEnabled',
    'generalResourceNotificationsEnabled',
    'significantUpdateNotificationsEnabled',
  ] as const)(
    'UPDATED obeys School %s even with minor override',
    async (field) => {
      const h = harness();
      Object.assign(h.publication, {
        supersedesPublicationId: randomUUID(),
        changeSignificance: 'MINOR',
        notifyMinorUpdate: true,
      });
      h.repository.findPolicy.mockResolvedValue({
        ...defaults,
        [field]: false,
      } as never);
      await h.service.generate(h.input, now);
      expect(h.generate).not.toHaveBeenCalled();
    },
  );
  it.each([
    'studentNotificationsEnabled',
    'guardianNotificationsEnabled',
  ] as const)('UPDATED preserves the %s gate', async (field) => {
    const h = harness();
    Object.assign(h.publication, {
      supersedesPublicationId: randomUUID(),
      changeSignificance: 'SIGNIFICANT',
      notifyMinorUpdate: false,
    });
    h.repository.findPolicy.mockResolvedValue({
      ...defaults,
      [field]: false,
    } as never);
    await h.service.generate(h.input, now);
    expect(h.generate.mock.calls[0][0].recipients).toHaveLength(1);
  });
  it('deduplicates two child contexts into one Parent notification', async () => {
    const h = harness(1);
    await h.service.generate(h.input, now);
    const recipients = h.generate.mock.calls[0][0].recipients;
    expect(recipients).toHaveLength(1);
    expect(recipients[0].metadata.studentIds).toHaveLength(2);
    expect(recipients[0].metadata.studentIds).toEqual(
      [...recipients[0].metadata.studentIds].sort(),
    );
    expect(recipients[0].metadata.childContextCount).toBe(2);
    expect(h.generate.mock.calls[0][0].body).toBe('Frozen revision title');
    expect(Object.keys(recipients[0].metadata).sort()).toEqual(
      [
        'academicContentId',
        'publicationId',
        'revisionId',
        'contentType',
        'eventType',
        'publishedAt',
        'studentIds',
        'childContextCount',
      ].sort(),
    );
  });
  it('processes 505 users in 500/5 batches and one Parent across internal context pages', async () => {
    const h = harness(505, 501);
    expect(await h.service.generate(h.input, now)).toMatchObject({
      recipientCount: 505,
      createdNotificationCount: 505,
    });
    const batches = h.generate.mock.calls.map(([batch]) => batch);
    expect(batches.map((batch) => batch.recipients.length)).toEqual([500, 5]);
    const ids = batches.flatMap((batch) =>
      batch.recipients.map((row) => row.recipientUserId),
    );
    expect(new Set(ids).size).toBe(505);
    expect(batches[0].recipients[0].metadata.childContextCount).toBe(501);
    expect(h.repository.listContexts.mock.calls.length).toBeGreaterThan(2);
    expect(
      h.repository.listContexts.mock.calls.every(
        ([, ids]) => ids.length <= 500,
      ),
    ).toBe(true);
  });
  it('does not generate missing/ineligible sources or disabled School/type policy', async () => {
    const h = harness();
    h.repository.findSource.mockResolvedValueOnce(null);
    expect((await h.service.generate(h.input, now)).skippedReason).toBe(
      'source_not_eligible',
    );
    h.repository.findPolicy.mockResolvedValueOnce({
      notificationsEnabled: false,
    });
    await h.service.generate(h.input, now);
    h.repository.findPolicy.mockResolvedValueOnce({
      generalResourceNotificationsEnabled: false,
    });
    await h.service.generate(h.input, now);
    expect(h.generate).not.toHaveBeenCalled();
  });
  it('keeps the publication worker successful on post-commit enqueue failure and repairs ALREADY_PUBLISHED', async () => {
    const h = harness();
    h.ensure.mockRejectedValue(new Error('Redis unavailable'));
    for (const outcome of ['PUBLISHED', 'ALREADY_PUBLISHED']) {
      let commit: (value: { outcome: string }) => void = () => undefined;
      const snapshots = {
        publishScheduledPublication: jest.fn(
          () =>
            new Promise<{ outcome: string }>((resolve) => {
              commit = resolve;
            }),
        ),
      };
      const worker = new AcademicContentPublicationWorker(
        {} as never,
        snapshots as never,
        {} as never,
        { ensureAfterCommit: jest.fn() } as never,
        {} as never,
        h.service,
      );
      const work = worker.process(
        'publish',
        {
          schoolId: h.input.schoolId,
          contentId: h.input.contentId,
          publicationId: h.input.publicationId,
        },
        now,
      );
      expect(h.ensure).toHaveBeenCalledTimes(outcome === 'PUBLISHED' ? 0 : 1);
      commit({ outcome });
      await expect(work).resolves.toBeUndefined();
    }
    expect(h.ensure).toHaveBeenCalledTimes(2);
  });
  it('uses persisted actor eligibility and deterministic bounded recovery pages', async () => {
    const h = harness();
    h.publication.createdBy.status = UserStatus.DISABLED;
    const first = Array.from({ length: 100 }, () => ({
      ...h.publication,
      id: randomUUID(),
    }));
    h.repository.listRecoveryCandidates
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([h.publication]);
    expect(await h.service.recover(now)).toBe(101);
    expect(h.ensure.mock.calls[0][0]).toMatchObject({
      actorUserId: null,
      actorUserType: null,
    });
    expect(h.repository.listRecoveryCandidates.mock.calls[1]).toEqual([
      now,
      { dueAt: now, id: first[99].id },
    ]);
  });
});

describe('ACC-8B snapshot repository query bounds', () => {
  it('uses PostgreSQL distinct user pagination and exact immutable context identity', async () => {
    const groupBy = jest.fn().mockResolvedValue([{ recipientUserId: uuid(1) }]);
    const findMany = jest.fn().mockResolvedValue([]);
    const findFirst = jest.fn().mockResolvedValue(null);
    const queryRaw = jest
      .fn<Promise<unknown[]>, [unknown]>()
      .mockResolvedValue([]);
    const repository = new AcademicContentPublicationNotificationRepository({
      academicContentAudienceRecipient: { groupBy, findMany },
      academicContentPublication: { findFirst, findMany },
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
    const publication = source();
    await repository.listRecipientUsers(publication, uuid(0));
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['recipientUserId'],
        take: 500,
        orderBy: { recipientUserId: 'asc' },
        where: {
          schoolId: publication.schoolId,
          publicationId: publication.id,
          revisionId: publication.revisionId,
          recipientUserId: { not: null, gt: uuid(0) },
        },
      }),
    );
    await repository.listContexts(publication, [uuid(1)], uuid(0));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        where: expect.objectContaining({
          publicationId: publication.id,
          revisionId: publication.revisionId,
          schoolId: publication.schoolId,
          id: { gt: uuid(0) },
        }) as unknown,
      }),
    );
    await repository.findSource(
      {
        schoolId: publication.schoolId,
        publicationId: publication.id,
        contentId: publication.academicContentId,
      },
      now,
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PUBLISHED',
          publishedAt: { not: null, lte: now },
          visibleFrom: { lte: now },
          revision: { snapshotContractVersion: 2 },
          OR: [{ visibleUntil: null }, { visibleUntil: { gt: now } }],
        }) as unknown,
      }),
    );
    await repository.listRecoveryCandidates(now);
    const sql = queryRaw.mock.calls[0][0] as {
      strings: string[];
      values: unknown[];
    };
    expect(sql.strings.join('')).toContain(
      'GREATEST(p.published_at, p.visible_from)',
    );
    expect(sql.values).toContainEqual(new Date(now.getTime() - 86400000));
    expect(sql.values).toContain(100);
  });
});

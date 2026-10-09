import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentEngagementService } from '../../src/modules/academics/academic-content/application/academic-content-engagement.service';
import { AcademicContentEngagementRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-engagement.repository';
import {
  teacherAcademicContentAnalyticsQuery,
  type AcademicContentTeacherAnalyticsRow,
} from '../../src/modules/academics/academic-content/infrastructure/academic-content-teacher-analytics.repository';
import { AcademicContentTeacherAnalyticsFixture } from '../fixtures/academic-content-teacher-analytics.fixture';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';

describe('ACC-11E real PostgreSQL cross-feature closeout', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService();
  const concurrent = new PrismaService();
  let fixture: AcademicContentTeacherAnalyticsFixture;
  beforeAll(async () => {
    assertDisposablePostgresTarget({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      universalRegressionMarker:
        process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
      localDatabasePredicate: (name) =>
        /^(?:ci_[0-9a-f]{14}|moazez_test(?:_[a-z0-9_-]+)?)$/.test(name),
      errorMessage: 'ACC-11E requires disposable PostgreSQL',
    });
    await Promise.all([prisma.$connect(), concurrent.$connect()]);
  });
  beforeEach(async () => {
    fixture = new AcademicContentTeacherAnalyticsFixture(prisma);
    await fixture.create();
  });
  afterEach(async () => {
    jest.useRealTimers();
    await fixture.dispose();
  });
  afterAll(async () => {
    await Promise.all([prisma.$disconnect(), concurrent.$disconnect()]);
  });

  it.each([
    { offset: 0, successorKind: 'analytics' },
    { offset: 60_000, successorKind: 'analytics' },
    { offset: 0, successorKind: 'acknowledgement' },
    { offset: 60_000, successorKind: 'acknowledgement' },
  ])(
    'keeps database-visible initial and $successorKind successor obligations with Node clock offset $offset ms',
    async ({ offset, successorKind }) => {
      jest.useFakeTimers({
        now: Date.now() + offset,
        doNotFake: [
          'hrtime',
          'nextTick',
          'performance',
          'queueMicrotask',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
          'setTimeout',
          'clearTimeout',
        ],
      });
      const source = await fixture.ownedSource('GUARDIAN_WEEKLY_NOTE');
      const first = await fixture.acknowledge(source);
      const successor =
        successorKind === 'analytics'
          ? await fixture.successor(source)
          : await prisma.$transaction(async (tx) => {
              await fixture.revoke(tx, 'Supersession', source);
              const publication =
                await tx.academicContentPublication.findFirstOrThrow({
                  where: {
                    academicContentId: source.content.id,
                    status: 'PUBLISHED',
                  },
                });
              const revision =
                await tx.academicContentRevision.findUniqueOrThrow({
                  where: { id: publication.revisionId },
                });
              return { ...source, publication, revision };
            });
      await expect(fixture.acknowledge(source)).rejects.toMatchObject({
        httpStatus: 404,
      });
      expect(await fixture.acknowledge(successor, false)).toMatchObject({
        status: 'PENDING',
        acknowledgementId: null,
      });
      const next = await fixture.acknowledge(successor);
      expect(next.status).toBe('ACKNOWLEDGED');
      expect(next.acknowledgementId).not.toBe(first.acknowledgementId);
      expect(
        await prisma.academicContentAcknowledgement.count({
          where: { academicContentId: source.content.id },
        }),
      ).toBe(2);
      const [{ at }] = await prisma.$queryRaw<
        { at: Date }[]
      >`SELECT clock_timestamp() AS at`;
      const future = new Date(at.getTime() + 60_000);
      await prisma.academicContentPublication.update({
        where: { id: successor.publication.id },
        data: { publishedAt: future, visibleFrom: future },
      });
      await expect(fixture.acknowledge(successor)).rejects.toMatchObject({
        httpStatus: 404,
      });
      expect(
        await prisma.academicContentAcknowledgement.count({
          where: { academicContentId: source.content.id },
        }),
      ).toBe(2);
    },
  );

  it.each(['7d', '30d', '90d'] as const)(
    'preserves actual UTC %s windows in a non-UTC database session',
    async (range) => {
      const source = await fixture.ownedSource('GUARDIAN_WEEKLY_NOTE');
      await fixture.event(source, 'CONTENT_VIEWED', 'PARENT');
      await fixture.ack(source);
      const rows = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL TIME ZONE 'Asia/Kolkata'`;
        const [{ zone, at }] = await tx.$queryRaw<
          { zone: string; at: Date }[]
        >`SELECT current_setting('TimeZone') AS zone, statement_timestamp() AT TIME ZONE 'UTC' AS at`;
        expect(zone).toBe('Asia/Kolkata');
        const [result] = await tx.$queryRaw<
          AcademicContentTeacherAnalyticsRow[]
        >(
          teacherAcademicContentAnalyticsQuery(
            fixture.scope,
            source.content.id,
            range,
          ),
        );
        expect(
          result.toExclusive.getTime() - at.getTime(),
        ).toBeGreaterThanOrEqual(0);
        expect(result.toExclusive.getTime() - at.getTime()).toBeLessThan(3000);
        expect(result.toExclusive.getTime() - result.from.getTime()).toBe(
          Number.parseInt(range) * 86_400_000,
        );
        return result;
      });
      expect(rows).toMatchObject({
        totalEventReports: '1',
        distinctParentChildPairsEngaged: '1',
        acknowledgementRecords: '1',
        distinctAcknowledgingParentChildPairs: '1',
      });
      // Midnight boundary injection changes only the clock expression, as in ACC-11D.
      const to = new Date('2026-10-08T00:00:00.000Z');
      const from = new Date(to.getTime() - Number.parseInt(range) * 86_400_000);
      await prisma.academicContentEngagementEvent.deleteMany({
        where: { academicContentId: source.content.id },
      });
      for (const at of [
        new Date(from.getTime() - 1),
        from,
        new Date(to.getTime() - 1),
        to,
      ]) {
        await fixture.event(source, 'CONTENT_VIEWED', 'PARENT', 0, false, at);
      }
      const query = teacherAcademicContentAnalyticsQuery(
        fixture.scope,
        source.content.id,
        range,
      );
      const strings = query.strings.map((part) =>
        part.replace(
          "statement_timestamp() AT TIME ZONE 'UTC'",
          "TIMESTAMP '2026-10-08 00:00:00'",
        ),
      ) as unknown as TemplateStringsArray;
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL TIME ZONE 'Asia/Kolkata'`;
        const [result] = await tx.$queryRaw<
          AcademicContentTeacherAnalyticsRow[]
        >(Prisma.sql(strings, ...query.values));
        expect(result).toMatchObject({
          from,
          toExclusive: to,
          totalEventReports: '2',
          distinctParentChildPairsEngaged: '1',
        });
      });
    },
  );

  it('arbitrates the last shared admission across concurrent event and acknowledgement writes', async () => {
    const source = await fixture.ownedSource('GUARDIAN_WEEKLY_NOTE');
    const context = fixture.parentContext();
    const eventRepositories = [prisma, concurrent].map(
      (client) => new AcademicContentEngagementRepository(client),
    );
    await eventRepositories[0].admit(context, fixture.parentMembershipId);
    await prisma.academicContentEngagementAdmission.updateMany({
      where: {
        schoolId: fixture.school.schoolId,
        actorUserId: fixture.parentId,
      },
      data: { requestCount: 59 },
    });
    const [{ first }, { second }] = await Promise.all([
      prisma.$queryRaw<
        { first: number }[]
      >`SELECT pg_backend_pid() AS first`.then((rows) => rows[0]),
      concurrent.$queryRaw<
        { second: number }[]
      >`SELECT pg_backend_pid() AS second`.then((rows) => rows[0]),
    ]);
    expect(first).not.toBe(second);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        index % 2 === 0
          ? fixture.asParent(() =>
              new AcademicContentEngagementService(
                eventRepositories[index % 3 === 0 ? 1 : 0],
              ).record(context, source.content.id, {
                clientRequestId: randomUUID(),
                eventType: 'CONTENT_VIEWED',
                expectedPublicationId: source.publication.id,
              }),
            )
          : fixture.acknowledge(source),
      ),
    );
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        const error: unknown = outcome.reason;
        expect(error).toMatchObject({
          httpStatus: 429,
          code: 'rate_limit.exceeded',
        });
      }
    }
    const events = await prisma.academicContentEngagementEvent.count({
      where: { academicContentId: source.content.id },
    });
    const acknowledgements = await prisma.academicContentAcknowledgement.count({
      where: { academicContentId: source.content.id },
    });
    expect(events + acknowledgements).toBe(1);
    expect(
      await prisma.academicContentEngagementAdmission.findFirstOrThrow({
        where: {
          schoolId: fixture.school.schoolId,
          actorUserId: fixture.parentId,
        },
      }),
    ).toMatchObject({ requestCount: 60 });
    await fixture.acknowledge(source, false);
    expect(
      await prisma.academicContentEngagementAdmission.findFirstOrThrow({
        where: {
          schoolId: fixture.school.schoolId,
          actorUserId: fixture.parentId,
        },
      }),
    ).toMatchObject({ requestCount: 60 });
    expect(
      (await prisma.academicContentEngagementEvent.count({
        where: { academicContentId: source.content.id },
      })) +
        (await prisma.academicContentAcknowledgement.count({
          where: { academicContentId: source.content.id },
        })),
    ).toBe(1);
  });
});

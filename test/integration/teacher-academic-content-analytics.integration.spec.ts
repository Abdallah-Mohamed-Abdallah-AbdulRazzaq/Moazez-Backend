import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import {
  AcademicContentTeacherAnalyticsRepository,
  teacherAcademicContentAnalyticsQuery,
  type AcademicContentTeacherAnalyticsRow,
} from '../../src/modules/academics/academic-content/infrastructure/academic-content-teacher-analytics.repository';
import {
  AcademicContentTeacherAnalyticsFixture,
  type AnalyticsSource,
} from '../fixtures/academic-content-teacher-analytics.fixture';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';

describe('ACC-11D real PostgreSQL aggregation and current ownership', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService(),
    repository = new AcademicContentTeacherAnalyticsRepository(prisma);
  let fixture: AcademicContentTeacherAnalyticsFixture, source: AnalyticsSource;
  const read = (publicationId?: string) =>
    repository.read(fixture.scope, source.content.id, '30d', publicationId);
  beforeAll(async () => {
    assertDisposablePostgresTarget({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      universalRegressionMarker:
        process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
      localDatabasePredicate: (name) =>
        /^(?:ci_[0-9a-f]{14}|moazez_test(?:_[a-z0-9_-]+)?)$/.test(name),
      errorMessage: 'ACC-11D requires disposable PostgreSQL',
    });
    await prisma.$connect();
  });
  beforeEach(async () => {
    fixture = new AcademicContentTeacherAnalyticsFixture(prisma);
    await fixture.create();
    source = await fixture.ownedSource();
  });
  afterEach(async () => fixture.dispose());
  afterAll(async () => prisma.$disconnect());

  it('returns ten deterministic zero bins for a zero-event publication and does not write', async () => {
    const before = await Promise.all([
      prisma.academicContentEngagementEvent.count(),
      prisma.academicContentAcknowledgement.count(),
      prisma.academicContentEngagementAdmission.count(),
      prisma.auditLog.count(),
    ]);
    const result = await read(source.publication.id);
    expect(result).toMatchObject({
      totalEventReports: '0',
      distinctStudentActorsEngaged: '0',
      distinctParentChildPairsEngaged: '0',
      acknowledgementRecords: '0',
      distinctAcknowledgingParentChildPairs: '0',
      includedPublicationCount: '1',
      revisionId: source.revision.id,
    });
    expect(result.eventCountsByTypeAndActorKind).toHaveLength(10);
    expect(
      result.eventCountsByTypeAndActorKind.every(
        (entry) => entry.count === '0',
      ),
    ).toBe(true);
    expect(
      await Promise.all([
        prisma.academicContentEngagementEvent.count(),
        prisma.academicContentAcknowledgement.count(),
        prisma.academicContentEngagementAdmission.count(),
        prisma.auditLog.count(),
      ]),
    ).toEqual(before);
  });
  it('counts all five types and both actor kinds without multiplying two revision targets', async () => {
    const types = [
      'CONTENT_VIEWED',
      'FILE_PREVIEWED',
      'FILE_DOWNLOADED',
      'LINK_CLICKED',
      'JOIN_LINK_CLICKED',
    ] as const;
    for (const type of types)
      for (const actor of ['STUDENT', 'PARENT'] as const)
        await fixture.event(source, type, actor);
    await fixture.event(source);
    await fixture.event(source, 'CONTENT_VIEWED', 'STUDENT', 1);
    await fixture.event(
      source,
      'CONTENT_VIEWED',
      'PARENT',
      0,
      false,
      undefined,
      1,
    );
    await fixture.event(source, 'CONTENT_VIEWED', 'PARENT', 1);
    await fixture.event(source, 'CONTENT_VIEWED', 'PARENT', 0, true);
    const result = await read();
    expect(result.totalEventReports).toBe('15');
    expect(result.distinctStudentActorsEngaged).toBe('2');
    expect(result.distinctParentChildPairsEngaged).toBe('3');
    expect(result.acknowledgementRecords).toBe('0');
    expect(result.eventCountsByTypeAndActorKind).toEqual(
      types.flatMap((eventType) =>
        ['STUDENT', 'PARENT'].map((actorKind) => ({
          eventType,
          actorKind,
          count:
            eventType === 'CONTENT_VIEWED'
              ? actorKind === 'STUDENT'
                ? '3'
                : '4'
              : '1',
        })),
      ),
    );
  });
  it('deduplicates across the full publication set and keeps successor acknowledgement obligations separate', async () => {
    source = await fixture.ownedSource('GUARDIAN_WEEKLY_NOTE');
    const successor = await fixture.successor(source);
    await fixture.event(source);
    await fixture.event(successor);
    await fixture.event(source, 'CONTENT_VIEWED', 'PARENT');
    await fixture.event(
      successor,
      'CONTENT_VIEWED',
      'PARENT',
      0,
      false,
      undefined,
      1,
    );
    await fixture.ack(source);
    await fixture.ack(source, 0, true);
    await fixture.ack(source, 1);
    await fixture.ack(successor, 0, false, undefined, 1);
    const result = await read();
    expect(result).toMatchObject({
      totalEventReports: '4',
      distinctStudentActorsEngaged: '1',
      distinctParentChildPairsEngaged: '1',
      acknowledgementRecords: '4',
      distinctAcknowledgingParentChildPairs: '3',
      includedPublicationCount: '2',
      revisionId: null,
    });
    expect(await read(source.publication.id)).toMatchObject({
      totalEventReports: '2',
      acknowledgementRecords: '3',
      revisionId: source.revision.id,
    });
    expect(await read(successor.publication.id)).toMatchObject({
      totalEventReports: '2',
      acknowledgementRecords: '1',
      revisionId: successor.revision.id,
    });
  });
  it('retains cancelled/expired reports after recipient account and relationship changes', async () => {
    await fixture.event(source, 'CONTENT_VIEWED', 'PARENT');
    const successor = await fixture.successor(source);
    await fixture.event(successor);
    await prisma.academicContentPublication.update({
      where: { id: source.publication.id },
      data: {
        status: 'CANCELLED',
        expiredAt: null,
        cancelledAt: new Date(),
        cancellationReason: 'WITHDRAWN',
      },
    });
    await prisma.academicContentPublication.update({
      where: { id: successor.publication.id },
      data: { status: 'EXPIRED', expiredAt: new Date() },
    });
    await prisma.studentGuardian.deleteMany({
      where: { guardianId: { in: fixture.guardianIds } },
    });
    await prisma.guardian.updateMany({
      where: { id: { in: fixture.guardianIds } },
      data: { userId: fixture.foreignParentId, deletedAt: new Date() },
    });
    await prisma.user.update({
      where: { id: fixture.parentId },
      data: { status: 'DISABLED' },
    });
    expect(await read()).toMatchObject({
      totalEventReports: '2',
      distinctStudentActorsEngaged: '1',
      distinctParentChildPairsEngaged: '1',
      includedPublicationCount: '2',
    });
    expect(await read(source.publication.id)).toMatchObject({
      totalEventReports: '1',
      revisionId: source.revision.id,
    });
  });
  it('excludes foreign immutable publication targets and never substitutes a successor', async () => {
    const successor = await fixture.successor(source, [
      fixture.foreignAllocationId,
    ]);
    await fixture.event(source);
    await fixture.event(successor);
    expect(await read()).toMatchObject({
      totalEventReports: '1',
      includedPublicationCount: '1',
    });
    await expect(read(successor.publication.id)).rejects.toMatchObject({
      httpStatus: 404,
    });
    await prisma.academicContentRevisionTarget.updateMany({
      where: { revisionId: source.revision.id },
      data: { teacherSubjectAllocationId: null },
    });
    await expect(read(source.publication.id)).rejects.toMatchObject({
      httpStatus: 404,
    });
    expect(await read()).toMatchObject({
      totalEventReports: '0',
      includedPublicationCount: '0',
    });
  });
  it.each([
    'SCHOOL',
    'UNBOUND',
    'FOREIGN',
    'PARTIAL',
    'CREATOR',
    'DELETED',
    'MISMATCH',
  ] as const)(
    'denies %s current ownership without disclosure',
    async (kind) => {
      if (kind === 'SCHOOL')
        await prisma.academicContentTarget.create({
          data: {
            schoolId: fixture.school.schoolId,
            academicContentId: source.content.id,
            scopeType: 'SCHOOL',
            createdByUserId: fixture.authorId,
            identityFingerprint: 'f'.repeat(64),
          },
        });
      if (kind === 'UNBOUND')
        await prisma.academicContentTarget.updateMany({
          where: { academicContentId: source.content.id },
          data: { teacherSubjectAllocationId: null },
        });
      if (kind === 'FOREIGN' || kind === 'PARTIAL')
        await prisma.teacherSubjectAllocation.updateMany({
          where: {
            id: {
              in:
                kind === 'PARTIAL'
                  ? [fixture.allocationIds[1]]
                  : fixture.allocationIds,
            },
          },
          data: { teacherUserId: fixture.otherTeacherId },
        });
      if (kind === 'CREATOR')
        await prisma.academicContent.update({
          where: { id: source.content.id },
          data: { createdByUserId: fixture.otherTeacherId },
        });
      if (kind === 'DELETED')
        await prisma.academicContent.update({
          where: { id: source.content.id },
          data: { deletedAt: new Date() },
        });
      if (kind === 'MISMATCH')
        await prisma.academicContentTarget.updateMany({
          where: { academicContentId: source.content.id },
          data: { classroomId: fixture.foreignClassroomId },
        });
      await expect(read()).rejects.toMatchObject({ httpStatus: 404 });
      await expect(read(source.publication.id)).rejects.toMatchObject({
        httpStatus: 404,
      });
    },
  );
  it.each([
    'ACTOR_TYPE',
    'ACTOR_STATUS',
    'MEMBERSHIP',
    'MEMBERSHIP_ORG',
    'VIEW_GRANT',
    'OWN_GRANT',
    'ROLE',
    'SCHOOL',
    'ORGANIZATION',
    'TERM',
    'YEAR',
    'CLASSROOM',
    'SUBJECT',
    'CURRICULUM',
  ] as const)('final statement denies stale %s authority', async (kind) => {
    if (kind === 'ACTOR_TYPE' || kind === 'ACTOR_STATUS')
      await prisma.user.update({
        where: { id: fixture.authorId },
        data:
          kind === 'ACTOR_TYPE'
            ? { userType: 'SCHOOL_USER' }
            : { status: 'DISABLED' },
      });
    if (kind === 'MEMBERSHIP' || kind === 'MEMBERSHIP_ORG')
      await prisma.membership.update({
        where: { id: fixture.teacherMembershipId },
        data:
          kind === 'MEMBERSHIP'
            ? { status: 'INACTIVE', endedAt: new Date() }
            : { organizationId: fixture.schools[1].organizationId },
      });
    if (kind === 'VIEW_GRANT' || kind === 'OWN_GRANT')
      await prisma.rolePermission.deleteMany({
        where: {
          roleId: fixture.teacherRoleId,
          permission: {
            code:
              kind === 'VIEW_GRANT'
                ? 'academics.academic_content.view'
                : 'academics.academic_content.analytics.own.view',
          },
        },
      });
    if (kind === 'ROLE')
      await prisma.role.update({
        where: { id: fixture.teacherRoleId },
        data: { deletedAt: new Date() },
      });
    if (kind === 'SCHOOL')
      await prisma.school.update({
        where: { id: fixture.school.schoolId },
        data: { status: 'SUSPENDED' },
      });
    if (kind === 'ORGANIZATION')
      await prisma.organization.update({
        where: { id: fixture.school.organizationId },
        data: { status: 'SUSPENDED' },
      });
    if (kind === 'TERM')
      await prisma.term.update({
        where: { id: fixture.school.termId },
        data: { deletedAt: new Date() },
      });
    if (kind === 'YEAR')
      await prisma.academicYear.update({
        where: { id: fixture.school.yearId },
        data: { deletedAt: new Date() },
      });
    if (kind === 'CLASSROOM')
      await prisma.classroom.update({
        where: { id: fixture.school.classroomId },
        data: { deletedAt: new Date() },
      });
    if (kind === 'SUBJECT')
      await prisma.subject.update({
        where: { id: fixture.school.subjectId },
        data: { deletedAt: new Date() },
      });
    if (kind === 'CURRICULUM')
      await prisma.subjectAllocation.updateMany({
        where: { schoolId: fixture.school.schoolId },
        data: { weeklyHours: 0 },
      });
    await expect(read()).rejects.toMatchObject({ httpStatus: 404 });
  });
  it('rejects cross-School, cross-Organization, foreign Teacher and unknown identities', async () => {
    const foreign = await fixture.publication('ONLINE_SESSION', 1);
    for (const contentId of [foreign.content.id, randomUUID()])
      await expect(
        repository.read(fixture.scope, contentId),
      ).rejects.toMatchObject({ httpStatus: 404 });
    for (const override of [
      { organizationId: fixture.schools[1].organizationId },
      { schoolId: fixture.schools[1].schoolId },
      { teacherUserId: fixture.otherTeacherId },
      { membershipId: fixture.parentMembershipId },
    ])
      await expect(
        repository.read({ ...fixture.scope, ...override }, source.content.id),
      ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(read(randomUUID())).rejects.toMatchObject({ httpStatus: 404 });
  });
  it.each(['7d', '30d', '90d'] as const)(
    'uses exact UTC half-open %s event and acknowledgement boundaries',
    async (range) => {
      source = await fixture.ownedSource('GUARDIAN_WEEKLY_NOTE');
      const days = Number.parseInt(range),
        to = new Date('2026-10-08T00:00:00.000Z'),
        from = new Date(to.getTime() - days * 86400000);
      const times = [
        new Date(from.getTime() - 1),
        from,
        new Date(to.getTime() - 1),
        to,
      ];
      for (const at of times)
        await fixture.event(source, 'CONTENT_VIEWED', 'PARENT', 0, false, at);
      await fixture.ack(source, 0, false, from);
      await fixture.ack(source, 0, true, to);
      await fixture.ack(source, 1, false, new Date(to.getTime() - 1));
      const productionQuery = teacherAcademicContentAnalyticsQuery(
        fixture.scope,
        source.content.id,
        range,
      );
      // Replace only the database clock expression in the ACTUAL production query
      // with a fixed UTC instant. Every binding, fence and interval predicate remains.
      const strings = productionQuery.strings.map((part) =>
        part.replace(
          "statement_timestamp() AT TIME ZONE 'UTC'",
          "TIMESTAMP '2026-10-08 00:00:00'",
        ),
      ) as unknown as TemplateStringsArray;
      const [result] = await prisma.$queryRaw<
        AcademicContentTeacherAnalyticsRow[]
      >(Prisma.sql(strings, ...productionQuery.values));
      expect(result).toMatchObject({
        from,
        toExclusive: to,
        totalEventReports: '2',
        distinctParentChildPairsEngaged: '1',
        acknowledgementRecords: '2',
        distinctAcknowledgingParentChildPairs: '2',
      });
    },
  );
});

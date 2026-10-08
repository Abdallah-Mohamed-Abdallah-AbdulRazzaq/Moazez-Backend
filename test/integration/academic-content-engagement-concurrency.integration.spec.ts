import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentEngagementRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-engagement.repository';
import { AcademicContentEngagementCommand } from '../../src/modules/academics/academic-content/domain/academic-content-engagement.policy';
import { AcademicContentCurrentRecipientContext } from '../../src/modules/academics/academic-content/domain/academic-content-current-access.policy';
import { AcademicContentEngagementFixture } from '../fixtures/academic-content-engagement.fixture';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('ACC-11B independent PostgreSQL final-write races', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService(),
    revoker = new PrismaService(),
    observer = new PrismaService();
  const fixture = new AcademicContentEngagementFixture(prisma);
  const repository = new AcademicContentEngagementRepository(prisma);
  let source: Awaited<ReturnType<typeof fixture.publication>>;
  const request = (kind: 'STUDENT' | 'PARENT' = 'STUDENT', target = source) =>
    repository.record(
      fixture.context(kind),
      fixture.membership(kind),
      target.content.id,
      target.publication.id,
      { eventType: 'CONTENT_VIEWED', clientRequestId: randomUUID() },
    );
  async function blockedBy(pid: number) {
    const deadline = Date.now() + 1200;
    while (Date.now() < deadline) {
      const rows = await observer.$queryRaw<
        { blocked: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS blocked`;
      if (rows[0].blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('No real PostgreSQL blocking relationship observed');
  }
  beforeAll(async () => {
    await Promise.all([
      prisma.$connect(),
      revoker.$connect(),
      observer.$connect(),
    ]);
    await fixture.create();
    source = await fixture.publication();
  });
  afterAll(async () => {
    try {
      await fixture.dispose();
    } finally {
      await Promise.all([
        prisma.$disconnect(),
        revoker.$disconnect(),
        observer.$disconnect(),
      ]);
    }
  });

  it.each([
    'GuardianLink',
    'Actor',
    'Enrollment',
    'Permission',
    'Cancellation',
    'Supersession',
  ] as const)(
    'denies when %s revocation wins the actual database lock',
    async (kind) => {
      const held = barrier(),
        release = barrier();
      let pid = 0;
      const target =
        kind === 'Cancellation' || kind === 'Supersession'
          ? await fixture.publication()
          : source;
      const mutation = revoker.$transaction(
        async (tx) => {
          pid = (
            await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`
          )[0].pid;
          switch (kind) {
            case 'GuardianLink':
              await tx.studentGuardian.deleteMany({
                where: {
                  studentId: fixture.children[0].studentId,
                  guardianId: { in: fixture.guardianIds },
                },
              });
              break;
            case 'Actor':
              await tx.user.update({
                where: { id: fixture.children[0].userId },
                data: { status: 'DISABLED' },
              });
              break;
            case 'Enrollment':
              await tx.enrollment.update({
                where: { id: fixture.children[0].enrollmentId },
                data: { deletedAt: new Date() },
              });
              break;
            case 'Permission':
              await tx.rolePermission.deleteMany({
                where: { roleId: fixture.children[0].roleId },
              });
              break;
            case 'Cancellation':
            case 'Supersession': {
              await tx.$queryRaw`SELECT id FROM academic_contents WHERE id = ${target.content.id}::uuid AND school_id = ${fixture.school.schoolId}::uuid FOR UPDATE`;
              await tx.academicContentPublication.update({
                where: { id: target.publication.id },
                data:
                  kind === 'Cancellation'
                    ? {
                        status: 'CANCELLED',
                        cancelledAt: new Date(),
                        cancellationReason: 'WITHDRAWN',
                      }
                    : { status: 'EXPIRED', expiredAt: new Date() },
              });
              if (kind === 'Supersession') {
                const revision = await tx.academicContentRevision.create({
                  data: {
                    schoolId: fixture.school.schoolId,
                    academicContentId: target.content.id,
                    revisionNumber: 2,
                    snapshotContractVersion: 2,
                    academicYearId: fixture.school.yearId,
                    termId: fixture.school.termId,
                    type: 'GENERAL_RESOURCE',
                    audience: 'STUDENTS_AND_GUARDIANS',
                    title: 'Successor',
                    sourceStatus: 'DRAFT',
                    capturedByUserId: fixture.authorId,
                    targets: {
                      create: {
                        scopeType: 'SCHOOL',
                        identityFingerprint: 'c'.repeat(64),
                      },
                    },
                  },
                });
                const now = new Date();
                await tx.academicContentPublication.create({
                  data: {
                    schoolId: fixture.school.schoolId,
                    academicContentId: target.content.id,
                    revisionId: revision.id,
                    clientRequestId: randomUUID(),
                    requestFingerprint: 'c'.repeat(64),
                    status: 'PUBLISHED',
                    sourceContentStatus: 'DRAFT',
                    publishAt: now,
                    publishedAt: now,
                    visibleFrom: now,
                    supersedesPublicationId: target.publication.id,
                    changeSignificance: 'SIGNIFICANT',
                    createdByUserId: fixture.authorId,
                  },
                });
              }
            }
          }
          held.release();
          await release.promise;
        },
        { timeout: 10_000 },
      );
      await held.promise;
      // Attach the rejection handler immediately so no unhandled rejection is hidden.
      const writer = request(
        kind === 'GuardianLink' ? 'PARENT' : 'STUDENT',
        target,
      ).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      try {
        await blockedBy(pid);
      } finally {
        release.release();
      }
      await mutation;
      const result = await writer;
      expect(result).toMatchObject({ error: { httpStatus: 404 } });
      expect(
        await prisma.academicContentEngagementEvent.count({
          where: { academicContentId: target.content.id },
        }),
      ).toBe(0);
      if (kind === 'GuardianLink')
        await prisma.studentGuardian.createMany({
          data: fixture.guardianIds.map((guardianId) => ({
            schoolId: fixture.school.schoolId,
            guardianId,
            studentId: fixture.children[0].studentId,
          })),
        });
      if (kind === 'Actor')
        await prisma.user.update({
          where: { id: fixture.children[0].userId },
          data: { status: 'ACTIVE' },
        });
      if (kind === 'Enrollment')
        await prisma.enrollment.update({
          where: { id: fixture.children[0].enrollmentId },
          data: { deletedAt: null },
        });
      if (kind === 'Permission') {
        const permission = await prisma.permission.findUniqueOrThrow({
          where: { code: 'academics.academic_content.view' },
        });
        await prisma.rolePermission.create({
          data: {
            roleId: fixture.children[0].roleId,
            permissionId: permission.id,
          },
        });
      }
    },
  );
  it('uses a fresh database clock after the initial publication read and lock wait', async () => {
    const target = await fixture.publication();
    const expiry = new Date(Date.now() + 700);
    await prisma.academicContentPublication.update({
      where: { id: target.publication.id },
      data: { visibleUntil: expiry },
    });
    const held = barrier(),
      release = barrier();
    let pid = 0;
    const blocker = revoker.$transaction(
      async (tx) => {
        pid = (
          await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`
        )[0].pid;
        await tx.$queryRaw`SELECT id FROM students WHERE id = ${fixture.children[0].studentId}::uuid FOR UPDATE`;
        held.release();
        await release.promise;
      },
      { timeout: 10_000 },
    );
    await held.promise;
    const writer = request('STUDENT', target).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    try {
      await blockedBy(pid);
      while (
        !(
          await observer.$queryRaw<
            { expired: boolean }[]
          >`SELECT clock_timestamp() >= ${expiry} AS expired`
        )[0].expired
      )
        await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      release.release();
    }
    await blocker;
    expect(await writer).toMatchObject({ error: { httpStatus: 404 } });
    expect(
      await prisma.academicContentEngagementEvent.count({
        where: { academicContentId: target.content.id },
      }),
    ).toBe(0);
  });

  it.each(['Cancellation', 'GuardianLink'] as const)(
    'records before %s when the writer has already acquired the real authorization locks',
    async (kind) => {
      const target = await fixture.publication(),
        held = barrier(),
        release = barrier();
      // Instrument timing only: every authorization read and lock still runs on real PostgreSQL.
      const timing = repository as unknown as {
        references(
          this: void,
          tx: Prisma.TransactionClient,
          context: AcademicContentCurrentRecipientContext,
          identity: { publicationId: string; revisionId: string },
          command: AcademicContentEngagementCommand,
        ): Promise<object>;
      };
      const original = timing.references;
      const hook = jest
        .spyOn(timing, 'references')
        .mockImplementation(async (...args) => {
          const value = await original(...args);
          held.release();
          await release.promise;
          return value;
        });
      const kindActor = kind === 'GuardianLink' ? 'PARENT' : 'STUDENT';
      const writer = request(kindActor, target);
      await held.promise;
      const mutation = revoker.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          if (kind === 'Cancellation') {
            const updating =
              tx.$queryRaw`SELECT id FROM academic_contents WHERE id = ${target.content.id}::uuid AND school_id = ${fixture.school.schoolId}::uuid FOR UPDATE`.then(
                (value) => value,
              );
            await blockedByWriter(pid);
            await updating;
            await tx.academicContentPublication.update({
              where: { id: target.publication.id },
              data: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancellationReason: 'WITHDRAWN',
              },
            });
          } else {
            const deleting = tx.studentGuardian
              .deleteMany({
                where: {
                  studentId: fixture.children[0].studentId,
                  guardianId: { in: fixture.guardianIds },
                },
              })
              .then((value) => value);
            await blockedByWriter(pid);
            await deleting;
          }
        },
        { timeout: 10_000 },
      );
      async function blockedByWriter(pid: number) {
        const deadline = Date.now() + 1200;
        try {
          while (Date.now() < deadline) {
            const [{ blocked }] = await observer.$queryRaw<
              { blocked: boolean }[]
            >`SELECT cardinality(pg_blocking_pids(${pid}::integer)) > 0 AS blocked`;
            if (blocked) return;
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          throw new Error('Writer authorization lock did not block mutation');
        } finally {
          release.release();
        }
      }
      try {
        const result = await writer;
        await mutation;
        expect(
          await prisma.academicContentEngagementEvent.count({
            where: { id: result.id },
          }),
        ).toBe(1);
        await expect(request(kindActor, target)).rejects.toMatchObject({
          httpStatus: 404,
        });
      } finally {
        hook.mockRestore();
        release.release();
      }
      if (kind === 'GuardianLink')
        await prisma.studentGuardian.createMany({
          data: fixture.guardianIds.map((guardianId) => ({
            schoolId: fixture.school.schoolId,
            guardianId,
            studentId: fixture.children[0].studentId,
          })),
        });
    },
  );
});

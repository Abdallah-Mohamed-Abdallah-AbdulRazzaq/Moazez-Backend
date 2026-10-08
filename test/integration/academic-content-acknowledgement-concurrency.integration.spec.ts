import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentAcknowledgementRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-acknowledgement.repository';
import { AcademicContentCurrentRecipientContext } from '../../src/modules/academics/academic-content/domain/academic-content-current-access.policy';
import {
  ACKNOWLEDGEMENT_REVOCATIONS,
  AcademicContentAcknowledgementFixture,
} from '../fixtures/academic-content-acknowledgement.fixture';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

class LockObservedAcknowledgementRepository extends AcademicContentAcknowledgementRepository {
  originalNote(
    tx: Prisma.TransactionClient,
    context: Extract<
      AcademicContentCurrentRecipientContext,
      { actorKind: 'PARENT' }
    >,
    identity: { publicationId: string; revisionId: string },
    guardianId: string,
  ) {
    return super.note(tx, context, identity, guardianId);
  }
}

describe('ACC-11C independent PostgreSQL write and status lock races', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService(),
    revoker = new PrismaService(),
    observer = new PrismaService();
  const repository = new LockObservedAcknowledgementRepository(prisma);
  let fixture: AcademicContentAcknowledgementFixture;
  let source: Awaited<
    ReturnType<AcademicContentAcknowledgementFixture['note']>
  >;
  const resolve = (write = true) =>
    repository.resolve(
      fixture.parentContext(),
      fixture.parentMembershipId,
      source.content.id,
      source.publication.id,
      write,
    );
  async function blocked(pid: number, blocking: boolean) {
    const deadline = Date.now() + 1200;
    while (Date.now() < deadline) {
      const [row] = await observer.$queryRaw<{ yes: boolean }[]>(
        blocking
          ? Prisma.sql`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${pid}::integer = ANY(pg_blocking_pids(pid))) AS yes`
          : Prisma.sql`SELECT cardinality(pg_blocking_pids(${pid}::integer)) > 0 AS yes`,
      );
      if (row.yes) return;
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    throw new Error(
      'Required real PostgreSQL lock relationship was not observed',
    );
  }
  beforeAll(async () =>
    Promise.all([prisma.$connect(), revoker.$connect(), observer.$connect()]),
  );
  beforeEach(async () => {
    fixture = new AcademicContentAcknowledgementFixture(prisma);
    await fixture.create();
    source = await fixture.note(true, 0, true);
  });
  afterEach(async () => fixture.dispose());
  afterAll(async () =>
    Promise.all([
      prisma.$disconnect(),
      revoker.$disconnect(),
      observer.$disconnect(),
    ]),
  );

  it.each(ACKNOWLEDGEMENT_REVOCATIONS)(
    'denies %s when the revoker wins with zero inserted rows',
    async (kind) => {
      const held = barrier(),
        release = barrier();
      let pid = 0;
      const mutation = revoker.$transaction(
        async (tx) => {
          pid = (
            await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`
          )[0].pid;
          await fixture.revoke(tx, kind, source);
          held.release();
          await release.promise;
        },
        { timeout: 10_000 },
      );
      await held.promise;
      const writer = resolve().then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      try {
        await blocked(pid, true);
      } finally {
        release.release();
      }
      await mutation;
      expect(await writer).toMatchObject({ error: { httpStatus: 404 } });
      expect(
        await prisma.academicContentAcknowledgement.count({
          where: { publicationId: source.publication.id },
        }),
      ).toBe(0);
      await expect(resolve()).rejects.toMatchObject({ httpStatus: 404 });
      await expect(resolve(false)).rejects.toMatchObject({ httpStatus: 404 });
    },
  );

  it.each(ACKNOWLEDGEMENT_REVOCATIONS)(
    'commits before subsequent %s after the writer acquired its real authority locks',
    async (kind) => {
      const held = barrier(),
        release = barrier();
      const timing = repository as unknown as {
        note(
          this: void,
          tx: Prisma.TransactionClient,
          context: Extract<
            AcademicContentCurrentRecipientContext,
            { actorKind: 'PARENT' }
          >,
          identity: { publicationId: string; revisionId: string },
          guardianId: string,
        ): Promise<boolean>;
      };
      const hook = jest
        .spyOn(timing, 'note')
        .mockImplementation(async (...args) => {
          const result = await repository.originalNote(...args);
          held.release();
          await release.promise;
          return result;
        });
      const writer = resolve();
      await held.promise;
      const mutation = revoker.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          const updating = fixture.revoke(tx, kind, source);
          // Activate lazy PrismaPromises before checking the actual blocker.
          const active = Promise.resolve(updating);
          try {
            await blocked(pid, false);
          } finally {
            release.release();
          }
          await active;
        },
        { timeout: 10_000 },
      );
      try {
        const result = await writer;
        await mutation;
        expect(result.acknowledgement).not.toBeNull();
        const durable =
          await prisma.academicContentAcknowledgement.findUniqueOrThrow({
            where: { id: result.acknowledgement!.id },
          });
        expect(durable.acknowledgedAt).toEqual(
          result.acknowledgement!.acknowledgedAt,
        );
        await expect(resolve()).rejects.toMatchObject({ httpStatus: 404 });
        await expect(resolve(false)).rejects.toMatchObject({ httpStatus: 404 });
        expect(
          await prisma.academicContentAcknowledgement.findUniqueOrThrow({
            where: { id: durable.id },
          }),
        ).toEqual(durable);
      } finally {
        release.release();
        hook.mockRestore();
      }
    },
  );

  it.each(['GuardianLink', 'Supersession'] as const)(
    'denies status when concurrent %s wins a real lock wait',
    async (kind) => {
      const held = barrier(),
        release = barrier();
      let pid = 0;
      const mutation = revoker.$transaction(
        async (tx) => {
          pid = (
            await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`
          )[0].pid;
          await fixture.revoke(tx, kind, source);
          held.release();
          await release.promise;
        },
        { timeout: 10_000 },
      );
      await held.promise;
      const reader = resolve(false).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      try {
        await blocked(pid, true);
      } finally {
        release.release();
      }
      await mutation;
      expect(await reader).toMatchObject({ error: { httpStatus: 404 } });
      expect(
        await prisma.academicContentAcknowledgement.count({
          where: { publicationId: source.publication.id },
        }),
      ).toBe(0);
    },
  );

  it.each([false, true])(
    'uses a fresh database clock after authority lock wait (write=%s)',
    async (write) => {
      const expires = new Date(Date.now() + 700),
        held = barrier(),
        release = barrier();
      let pid = 0;
      await prisma.academicContentPublication.update({
        where: { id: source.publication.id },
        data: { visibleUntil: expires },
      });
      const holder = revoker.$transaction(
        async (tx) => {
          pid = (
            await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`
          )[0].pid;
          await tx.$queryRaw`SELECT id FROM students WHERE school_id = ${fixture.school.schoolId}::uuid AND id = ${fixture.children[0].studentId}::uuid FOR UPDATE`;
          held.release();
          await release.promise;
        },
        { timeout: 10_000 },
      );
      await held.promise;
      const pending = resolve(write).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      try {
        await blocked(pid, true);
        while (
          !(
            await observer.$queryRaw<
              { expired: boolean }[]
            >`SELECT clock_timestamp() >= ${expires} AS expired`
          )[0].expired
        )
          await new Promise((resolveWait) => setTimeout(resolveWait, 10));
      } finally {
        release.release();
      }
      await holder;
      expect(await pending).toMatchObject({ error: { httpStatus: 404 } });
      expect(
        await prisma.academicContentAcknowledgement.count({
          where: { publicationId: source.publication.id },
        }),
      ).toBe(0);
    },
  );

  it('returns a sanitized bounded 503 through the application when lock timeout wins', async () => {
    const held = barrier(),
      release = barrier();
    const holder = revoker.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM academic_contents WHERE school_id = ${fixture.school.schoolId}::uuid AND id = ${source.content.id}::uuid FOR UPDATE`;
        held.release();
        await release.promise;
      },
      { timeout: 10_000 },
    );
    await held.promise;
    try {
      await expect(fixture.acknowledge(source)).rejects.toMatchObject({
        code: 'service_unavailable',
        httpStatus: 503,
      });
      expect(
        await prisma.academicContentAcknowledgement.count({
          where: { publicationId: source.publication.id },
        }),
      ).toBe(0);
    } finally {
      release.release();
      await holder;
    }
  });

  it.each([true, false])(
    'reauthorizes after unique arbitration even if the conflicting insert rolls back (commit=%s)',
    async (commit) => {
      const expires = new Date(Date.now() + 700),
        held = barrier(),
        release = barrier();
      let pid = 0;
      await prisma.academicContentPublication.update({
        where: { id: source.publication.id },
        data: { visibleUntil: expires },
      });
      const firstWriter = revoker
        .$transaction(
          async (tx) => {
            pid = (
              await tx.$queryRaw<
                { pid: number }[]
              >`SELECT pg_backend_pid() AS pid`
            )[0].pid;
            const row = await tx.academicContentAcknowledgement.create({
              data: {
                schoolId: fixture.school.schoolId,
                academicContentId: source.content.id,
                publicationId: source.publication.id,
                revisionId: source.revision.id,
                studentId: fixture.children[0].studentId,
                enrollmentId: fixture.children[0].enrollmentId,
                actorUserId: fixture.parentId,
                guardianId: fixture.guardianIds[0],
              },
            });
            held.release();
            await release.promise;
            if (!commit) throw new Error('Fixture duplicate rollback');
            return row;
          },
          { timeout: 10_000 },
        )
        .then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
      await held.promise;
      const retry = resolve().then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      try {
        await blocked(pid, true);
        while (
          !(
            await observer.$queryRaw<
              { expired: boolean }[]
            >`SELECT clock_timestamp() >= ${expires} AS expired`
          )[0].expired
        )
          await new Promise((resolveWait) => setTimeout(resolveWait, 10));
      } finally {
        release.release();
      }
      const outcome = await firstWriter;
      expect(await retry).toMatchObject({ error: { httpStatus: 404 } });
      expect(
        await prisma.academicContentAcknowledgement.count({
          where: { publicationId: source.publication.id },
        }),
      ).toBe(commit ? 1 : 0);
      if (commit) {
        if (!('value' in outcome))
          throw new Error('Fixture insert did not commit');
        expect(
          await prisma.academicContentAcknowledgement.findUniqueOrThrow({
            where: { id: outcome.value.id },
          }),
        ).toEqual(outcome.value);
      } else {
        expect(outcome).toMatchObject({
          error: { message: 'Fixture duplicate rollback' },
        });
      }
    },
  );
});

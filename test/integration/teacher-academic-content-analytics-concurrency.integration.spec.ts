import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentTeacherAnalyticsRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-teacher-analytics.repository';
import { TeacherAcademicContentAnalyticsUseCase } from '../../src/modules/teacher-app/academic-content/application/teacher-academic-content-analytics.use-case';
import { TeacherAppAccessService } from '../../src/modules/teacher-app/access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from '../../src/modules/teacher-app/access/teacher-app-allocation-read.adapter';
import {
  AcademicContentTeacherAnalyticsFixture,
  type AnalyticsSource,
} from '../fixtures/academic-content-teacher-analytics.fixture';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
const changes = [
  'Allocation',
  'Permission',
  'ContentTarget',
  'School',
] as const;
describe('ACC-11D statement-snapshot races on independent PostgreSQL connections', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService(),
    revoker = new PrismaService();
  const repository = new AcademicContentTeacherAnalyticsRepository(prisma);
  const useCase = new TeacherAcademicContentAnalyticsUseCase(
    new TeacherAppAccessService(new TeacherAppAllocationReadAdapter(prisma)),
    repository,
  );
  let fixture: AcademicContentTeacherAnalyticsFixture, source: AnalyticsSource;
  const read = () =>
    fixture.asTeacher(() => useCase.execute(source.content.id, {}));
  async function revoke(
    tx: Prisma.TransactionClient,
    kind: (typeof changes)[number],
  ) {
    if (kind === 'Allocation')
      await tx.teacherSubjectAllocation.update({
        where: { id: fixture.allocationIds[1] },
        data: { teacherUserId: fixture.otherTeacherId },
      });
    if (kind === 'Permission')
      await tx.rolePermission.deleteMany({
        where: { roleId: fixture.teacherRoleId },
      });
    if (kind === 'ContentTarget')
      await tx.academicContentTarget.updateMany({
        where: { academicContentId: source.content.id },
        data: { teacherSubjectAllocationId: null },
      });
    if (kind === 'School')
      await tx.school.update({
        where: { id: fixture.school.schoolId },
        data: { status: 'SUSPENDED' },
      });
  }
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
    await Promise.all([prisma.$connect(), revoker.$connect()]);
  });
  beforeEach(async () => {
    fixture = new AcademicContentTeacherAnalyticsFixture(prisma);
    await fixture.create();
    source = await fixture.ownedSource();
    await fixture.event(source);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture.dispose();
  });
  afterAll(async () =>
    Promise.all([prisma.$disconnect(), revoker.$disconnect()]),
  );
  it.each(changes)(
    'read sees pre-commit %s truth while a real competing revoker is open; next read denies',
    async (kind) => {
      const held = barrier(),
        release = barrier();
      let revokerPid = 0;
      const mutation = revoker.$transaction(
        async (tx) => {
          revokerPid = (
            await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`
          )[0].pid;
          await revoke(tx, kind);
          held.release();
          await release.promise;
        },
        { timeout: 10_000 },
      );
      await held.promise;
      try {
        const [{ pid }] = await prisma.$queryRaw<
          { pid: number }[]
        >`SELECT pg_backend_pid() AS pid`;
        expect(pid).not.toBe(revokerPid);
        expect(await read()).toMatchObject({
          metrics: { totalEventReports: '1' },
        });
      } finally {
        release.release();
        await mutation;
      }
      await expect(read()).rejects.toMatchObject({ httpStatus: 404 });
      expect(
        await prisma.academicContentEngagementEvent.count({
          where: { publicationId: source.publication.id },
        }),
      ).toBe(1);
    },
  );
  it.each(changes)(
    'committed %s revocation after application admission is denied by the final aggregate statement',
    async (kind) => {
      const entered = barrier(),
        release = barrier(),
        actualRepository = new AcademicContentTeacherAnalyticsRepository(
          prisma,
        );
      jest.spyOn(repository, 'read').mockImplementation(async (...args) => {
        entered.release();
        await release.promise;
        return actualRepository.read(...args);
      });
      const contender = read().then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await entered.promise;
      try {
        await revoker.$transaction((tx) => revoke(tx, kind), {
          timeout: 10_000,
        });
      } finally {
        release.release();
      }
      expect(await contender).toMatchObject({ error: { httpStatus: 404 } });
      await expect(read()).rejects.toMatchObject({ httpStatus: 404 });
      expect(
        await prisma.academicContentEngagementEvent.count({
          where: { publicationId: source.publication.id },
        }),
      ).toBe(1);
    },
  );
});

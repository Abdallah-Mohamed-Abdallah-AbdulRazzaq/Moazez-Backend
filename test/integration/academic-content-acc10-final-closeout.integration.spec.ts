import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentCurrentAccessService } from '../../src/modules/academics/academic-content/application/academic-content-current-access.service';
import { AcademicContentAudienceRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-audience.repository';
import { AcademicContentRecipientReadRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-recipient-read.repository';
import { AcademicContentPublicationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication.repository';
import { AcademicContentRevisionRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision.repository';
import { AcademicContentPublicationLifecycleRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-lifecycle.repository';
import { AcademicContentPublicationSnapshotRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-snapshot.repository';
import { AcademicContentRevisionAudienceResolver } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision-audience.resolver';
import { StudentAppAccessService } from '../../src/modules/student-app/access/student-app-access.service';
import { StudentAppStudentReadAdapter } from '../../src/modules/student-app/access/student-app-student-read.adapter';
import { GetStudentAcademicContentUseCase } from '../../src/modules/student-app/academic-content/application/student-academic-content.use-cases';
import { ParentAppAccessService } from '../../src/modules/parent-app/access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from '../../src/modules/parent-app/access/parent-app-guardian-read.adapter';
import { GetParentAcademicContentUseCase } from '../../src/modules/parent-app/academic-content/application/parent-academic-content.use-cases';
import { AcademicContentScaleFixture } from '../fixtures/academic-content-scale.fixture';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';

const describeDatabase = process.env.DATABASE_URL ? describe : describe.skip;
describeDatabase('ACC-10F final recipient authorization gaps', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService();
  const fixture = new AcademicContentScaleFixture(prisma);
  const reads = new AcademicContentRecipientReadRepository(prisma);
  const audience = new AcademicContentAudienceRepository(prisma);
  const core = new AcademicContentCurrentAccessService(reads, audience);
  const studentDetail = new GetStudentAcademicContentUseCase(
    new StudentAppAccessService(new StudentAppStudentReadAdapter(prisma)),
    core,
  );
  const parentDetail = new GetParentAcademicContentUseCase(
    new ParentAppAccessService(new ParentAppGuardianReadAdapter(prisma)),
    core,
  );
  const contentId = () => fixture.id('content', 25);
  const publicationId = () => fixture.id('successor-publication', 25);
  const unavailable = { code: 'not_found', httpStatus: 404 };
  const detail = (actor: 'STUDENT' | 'PARENT', id = contentId()) =>
    fixture.asActor(actor, () =>
      actor === 'STUDENT'
        ? studentDetail.execute(id)
        : parentDetail.execute(fixture.studentIds[0], id),
    );

  beforeAll(async () => {
    assertDisposablePostgresTarget({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      universalRegressionMarker:
        process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
      localDatabasePredicate: (name) =>
        /^(?:ci_[0-9a-f]{14}|moazez_test(?:_[a-z0-9_-]+)?)$/.test(name),
      errorMessage: 'ACC-10F requires disposable PostgreSQL',
    });
    await prisma.$connect();
    await fixture.create();
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    await fixture.resetRelationships();
    await prisma.student.update({
      where: { id: fixture.studentIds[0] },
      data: {
        userId: fixture.studentUserIds[0],
        status: 'ACTIVE',
        deletedAt: null,
      },
    });
    await prisma.user.update({
      where: { id: fixture.studentUserIds[0] },
      data: { status: 'ACTIVE', deletedAt: null },
    });
    await prisma.guardian.update({
      where: { id: fixture.guardianId },
      data: { userId: fixture.parentUserId },
    });
    await prisma.academicContentPublication.update({
      where: { id: publicationId() },
      data: {
        status: 'PUBLISHED',
        visibleUntil: null,
        cancelledAt: null,
        cancellationReason: null,
      },
    });
    await prisma.academicContentAudienceRecipient.deleteMany({
      where: {
        schoolId: fixture.target.schoolId,
        publicationId: publicationId(),
      },
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  afterAll(async () => {
    try {
      const where = {
        schoolId: { in: fixture.schools.map((s) => s.schoolId) },
      };
      await prisma.academicContentAudienceRecipientTarget.deleteMany({ where });
      await prisma.academicContentRevisionLink.deleteMany({ where });
      await prisma.academicContentTarget.deleteMany({ where });
      await prisma.academicContentLink.deleteMany({ where });
      await prisma.auditLog.deleteMany({
        where,
      });
      await fixture.dispose();
      expect(
        await prisma.school.count({
          where: { id: { in: fixture.schools.map((s) => s.schoolId) } },
        }),
      ).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it.each([
    'enrollment-changed',
    'enrollment-withdrawn',
    'actor-inactive',
    'student-unlinked',
    'cancelled',
    'visibility-ended',
  ] as const)(
    'Student final real payload read denies after identity succeeds: %s',
    async (variant) => {
      const expiry = new Date(fixture.now.getTime() + 1000);
      if (variant === 'visibility-ended') {
        await prisma.academicContentPublication.update({
          where: { id: publicationId() },
          data: { visibleUntil: expiry },
        });
        // Leave database I/O timers real; advance only the application clock.
        jest.useFakeTimers({
          doNotFake: [
            'nextTick',
            'setImmediate',
            'clearImmediate',
            'setTimeout',
            'clearTimeout',
            'setInterval',
            'clearInterval',
          ],
        });
        jest.setSystemTime(fixture.now);
      }
      const canonical = reads.findCurrentStudentPublication.bind(
        reads,
      ) as typeof reads.findCurrentStudentPublication;
      const identityRead = jest
        .spyOn(reads, 'findCurrentStudentPublication')
        .mockImplementation(async (...args) => {
          const identity = await canonical(...args);
          expect(identity?.publicationId).toBe(publicationId());
          if (variant === 'enrollment-changed')
            await prisma.enrollment.update({
              where: { id: fixture.enrollmentIds[0] },
              data: { classroomId: fixture.target.otherClassroomId },
            });
          if (variant === 'enrollment-withdrawn')
            await prisma.enrollment.update({
              where: { id: fixture.enrollmentIds[0] },
              data: { status: 'WITHDRAWN' },
            });
          if (variant === 'actor-inactive')
            await prisma.user.update({
              where: { id: fixture.studentUserIds[0] },
              data: { status: 'DISABLED' },
            });
          if (variant === 'student-unlinked')
            await prisma.student.update({
              where: { id: fixture.studentIds[0] },
              data: { userId: null },
            });
          if (variant === 'cancelled')
            await prisma.academicContentPublication.update({
              where: { id: publicationId() },
              data: {
                status: 'CANCELLED',
                cancelledAt: fixture.now,
                cancellationReason: 'WITHDRAWN',
              },
            });
          if (variant === 'visibility-ended') jest.setSystemTime(expiry);
          return identity;
        });
      const finalRead = jest.spyOn(reads, 'findCurrentStudentDetail');
      await expect(detail('STUDENT')).rejects.toMatchObject(unavailable);
      expect(identityRead).toHaveBeenCalledTimes(1);
      expect(finalRead).toHaveBeenCalledTimes(1);
      expect(await finalRead.mock.results[0].value).toBeNull();
      if (variant === 'visibility-ended')
        expect(finalRead.mock.calls[0][2]).toEqual(expiry);
    },
  );

  it.each(['STUDENT', 'PARENT'] as const)(
    '%s final read denies predecessor after a governed successor publishes between phases',
    async (actor) => {
      const { schoolId, yearId, termId, classroomId } = fixture.target;
      const content = await prisma.academicContent.create({
        data: {
          schoolId,
          academicYearId: yearId,
          termId,
          type: 'GENERAL_RESOURCE',
          audience: 'STUDENTS_AND_GUARDIANS',
          title: 'Predecessor sensitive title',
          createdByUserId: fixture.authorId,
        },
      });
      await prisma.academicContentTarget.create({
        data: {
          schoolId,
          academicContentId: content.id,
          scopeType: 'CLASSROOM',
          classroomId,
          createdByUserId: fixture.authorId,
          identityFingerprint: randomBytes(32).toString('hex'),
        },
      });
      await prisma.academicContentLink.create({
        data: {
          schoolId,
          academicContentId: content.id,
          label: 'Resource',
          url: 'https://example.test/acc10f',
          sortOrder: 0,
          createdByUserId: fixture.authorId,
        },
      });
      const mutations = {
        schoolId,
        contentId: content.id,
        actorId: fixture.authorId,
        organizationId: fixture.organizationId,
        now: fixture.now,
      };
      const publications = new AcademicContentPublicationRepository(
        prisma,
        new AcademicContentRevisionRepository(prisma),
      );
      const snapshots = new AcademicContentPublicationSnapshotRepository(
        prisma,
        new AcademicContentRevisionAudienceResolver(audience),
      );
      const publish = async () => {
        const scheduled = await publications.schedule({
          ...mutations,
          command: { clientRequestId: randomUUID() },
        });
        await snapshots.publishScheduledPublication({
          schoolId,
          contentId: content.id,
          publicationId: scheduled.publicationId,
          now: fixture.now,
        });
        return scheduled;
      };
      const old = await publish();
      const method =
        actor === 'STUDENT'
          ? 'findCurrentStudentPublication'
          : 'findCurrentParentPublication';
      const canonicalStudent = reads.findCurrentStudentPublication.bind(
        reads,
      ) as typeof reads.findCurrentStudentPublication;
      const canonicalParent = reads.findCurrentParentPublication.bind(
        reads,
      ) as typeof reads.findCurrentParentPublication;
      let next: Awaited<ReturnType<typeof publish>> | undefined;
      const identityRead = jest
        .spyOn(reads, method)
        .mockImplementation(async (context, id, now) => {
          const identity =
            context.actorKind === 'STUDENT'
              ? await canonicalStudent(context, id, now)
              : await canonicalParent(context, id, now);
          expect(identity?.publicationId).toBe(old.publicationId);
          await new AcademicContentPublicationLifecycleRepository(
            prisma,
          ).startRevision({ ...mutations, publicationId: old.publicationId });
          await prisma.academicContent.update({
            where: { id: content.id },
            data: { title: 'Current successor title' },
          });
          next = await publish();
          return identity;
        });
      await expect(detail(actor, content.id)).rejects.toMatchObject(
        unavailable,
      );
      expect(identityRead).toHaveBeenCalledTimes(1);
      identityRead.mockRestore();
      const current = await detail(actor, content.id);
      expect(current.content.publicationId).toBe(next?.publicationId);
      expect(current.content.revisionId).toBe(next?.revisionId);
      expect(current.content.title).toBe('Current successor title');
      expect(JSON.stringify(current)).not.toContain(
        'Predecessor sensitive title',
      );
    },
  );

  it.each(['STUDENT', 'PARENT'] as const)(
    '%s recipient detail allows a later linked account while frozen historical user remains null',
    async (actor) => {
      const recipient = await prisma.academicContentAudienceRecipient.create({
        data: {
          schoolId: fixture.target.schoolId,
          publicationId: publicationId(),
          revisionId: fixture.id('successor-revision', 25),
          studentId: fixture.studentIds[0],
          enrollmentId: fixture.enrollmentIds[0],
          classroomId: fixture.target.classroomId,
          recipientKind: actor === 'STUDENT' ? 'STUDENT' : 'GUARDIAN',
          guardianId: actor === 'STUDENT' ? null : fixture.guardianId,
          recipientUserId: null,
          identityFingerprint: randomBytes(32).toString('hex'),
        },
      });
      if (actor === 'STUDENT')
        await prisma.student.update({
          where: { id: fixture.studentIds[0] },
          data: { userId: null },
        });
      else
        await prisma.guardian.update({
          where: { id: fixture.guardianId },
          data: { userId: null },
        });
      const context = fixture.context(actor);
      await expect(
        actor === 'STUDENT' && context.actorKind === 'STUDENT'
          ? core.getCurrentStudentContent(context, contentId())
          : context.actorKind === 'PARENT'
            ? core.getCurrentParentContent(context, contentId())
            : Promise.reject(new Error('Unexpected actor')),
      ).rejects.toMatchObject(unavailable);
      if (actor === 'STUDENT')
        await prisma.student.update({
          where: { id: fixture.studentIds[0] },
          data: { userId: fixture.studentUserIds[0] },
        });
      else
        await prisma.guardian.update({
          where: { id: fixture.guardianId },
          data: { userId: fixture.parentUserId },
        });
      expect((await detail(actor)).content.publicationId).toBe(publicationId());
      expect(
        await prisma.academicContentAudienceRecipient.findUnique({
          where: { id: recipient.id },
        }),
      ).toEqual(recipient);
    },
  );
});

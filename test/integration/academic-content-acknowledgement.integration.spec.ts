import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentAcknowledgementRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-acknowledgement.repository';
import { AcademicContentAcknowledgementService } from '../../src/modules/academics/academic-content/application/academic-content-acknowledgement.service';
import { AcademicContentAcknowledgementFixture } from '../fixtures/academic-content-acknowledgement.fixture';

describe('ACC-11C real PostgreSQL acknowledgement state, identity and authority', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService();
  let fixture: AcademicContentAcknowledgementFixture;
  let source: Awaited<
    ReturnType<AcademicContentAcknowledgementFixture['note']>
  >;
  beforeAll(async () => prisma.$connect());
  beforeEach(async () => {
    fixture = new AcademicContentAcknowledgementFixture(prisma);
    await fixture.create();
    source = await fixture.note();
  });
  afterEach(async () => fixture.dispose());
  afterAll(async () => prisma.$disconnect());

  it('derives PENDING and NOT_REQUIRED without acknowledgement, event, admission, notification or audit mutation', async () => {
    const counts = async () =>
      Promise.all([
        prisma.academicContentAcknowledgement.count(),
        prisma.academicContentEngagementEvent.count(),
        prisma.academicContentEngagementAdmission.count(),
        prisma.communicationNotification.count(),
        prisma.auditLog.count(),
      ]);
    const before = await counts();
    expect(await fixture.acknowledge(source, false)).toEqual({
      publicationId: source.publication.id,
      revisionId: source.revision.id,
      requiresAcknowledgement: true,
      status: 'PENDING',
      acknowledgementId: null,
      acknowledgedAt: null,
    });
    const optional = await fixture.note(false);
    expect(await fixture.acknowledge(optional, false)).toMatchObject({
      requiresAcknowledgement: false,
      status: 'NOT_REQUIRED',
      acknowledgementId: null,
      acknowledgedAt: null,
    });
    expect(await counts()).toEqual(before);
    await expect(fixture.acknowledge(optional)).rejects.toMatchObject({
      httpStatus: 404,
    });
    expect(await prisma.academicContentAcknowledgement.count()).toBe(before[0]);
  });
  it('returns the original bounded identity/time on repeat and GET', async () => {
    const first = await fixture.acknowledge(source);
    expect(first).toMatchObject({
      status: 'ACKNOWLEDGED',
      requiresAcknowledgement: true,
    });
    expect(first.acknowledgementId).toEqual(expect.any(String));
    expect(new Date(first.acknowledgedAt!).toISOString()).toBe(
      first.acknowledgedAt,
    );
    expect(await fixture.acknowledge(source)).toEqual(first);
    expect(await fixture.acknowledge(source, false)).toEqual(first);
    expect(
      await prisma.academicContentAcknowledgement.count({
        where: { publicationId: source.publication.id },
      }),
    ).toBe(1);
  });
  it('retains original historical Guardian and Enrollment when current selection and enrollment change', async () => {
    const first = await fixture.acknowledge(source);
    const original =
      await prisma.academicContentAcknowledgement.findUniqueOrThrow({
        where: { id: first.acknowledgementId! },
      });
    await prisma.studentGuardian.deleteMany({
      where: {
        schoolId: fixture.school.schoolId,
        guardianId: original.guardianId,
      },
    });
    expect(await fixture.acknowledge(source)).toEqual(first);
    await prisma.enrollment.update({
      where: { id: fixture.children[0].enrollmentId },
      data: { status: 'WITHDRAWN' },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: fixture.school.schoolId,
        studentId: fixture.children[0].studentId,
        academicYearId: fixture.school.yearId,
        termId: fixture.school.termId,
        classroomId: fixture.school.classroomId,
        enrolledAt: new Date(),
      },
    });
    const service = new AcademicContentAcknowledgementService(
      new AcademicContentAcknowledgementRepository(prisma),
    );
    expect(
      await fixture.asParent(() =>
        service.resolve(
          { ...fixture.parentContext(), enrollmentId: enrollment.id },
          source.content.id,
          source.publication.id,
          true,
        ),
      ),
    ).toEqual(first);
    expect(
      await prisma.academicContentAcknowledgement.findUniqueOrThrow({
        where: { id: first.acknowledgementId! },
      }),
    ).toEqual(original);
  });
  it('isolates different children and different Parent accounts for the same publication', async () => {
    const first = await fixture.acknowledge(source);
    expect(await fixture.acknowledge(source, false, 0, true)).toMatchObject({
      status: 'PENDING',
      acknowledgementId: null,
    });
    expect(await fixture.acknowledge(source, false, 1)).toMatchObject({
      status: 'PENDING',
      acknowledgementId: null,
    });
    const secondParent = await fixture.acknowledge(source, true, 0, true);
    const secondChild = await fixture.acknowledge(source, true, 1);
    expect(
      new Set([
        first.acknowledgementId,
        secondParent.acknowledgementId,
        secondChild.acknowledgementId,
      ]).size,
    ).toBe(3);
    await expect(
      fixture.acknowledge(source, false, 1, true),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(
      fixture.acknowledge(source, true, 1, true),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });
  it('arbitrates eight simultaneous requests through eight independent Prisma pools with one durable original', async () => {
    const clients = Array.from({ length: 8 }, () => new PrismaService());
    try {
      await Promise.all(clients.map((client) => client.$connect()));
      const pids = await Promise.all(
        clients.map(
          (client) =>
            client.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`,
        ),
      );
      expect(new Set(pids.map((rows) => rows[0].pid)).size).toBe(8);
      const responses = await Promise.all(
        clients.map((client) =>
          fixture.asParent(() =>
            new AcademicContentAcknowledgementService(
              new AcademicContentAcknowledgementRepository(client),
            ).resolve(
              fixture.parentContext(),
              source.content.id,
              source.publication.id,
              true,
            ),
          ),
        ),
      );
      for (const response of responses) expect(response).toEqual(responses[0]);
      expect(
        await prisma.academicContentAcknowledgement.count({
          where: { publicationId: source.publication.id },
        }),
      ).toBe(1);
      expect(
        (
          await prisma.academicContentEngagementAdmission.findUniqueOrThrow({
            where: {
              schoolId_actorUserId: {
                schoolId: fixture.school.schoolId,
                actorUserId: fixture.parentId,
              },
            },
          })
        ).requestCount,
      ).toBe(8);
    } finally {
      await Promise.all(clients.map((client) => client.$disconnect()));
    }
  });
  it('creates a new obligation for the canonical successor and preserves predecessor history', async () => {
    const first = await fixture.acknowledge(source);
    await prisma.academicContentPublication.update({
      where: { id: source.publication.id },
      data: { status: 'EXPIRED', expiredAt: new Date() },
    });
    const revision = await prisma.academicContentRevision.create({
      data: {
        schoolId: fixture.school.schoolId,
        academicContentId: source.content.id,
        revisionNumber: 2,
        snapshotContractVersion: 2,
        academicYearId: fixture.school.yearId,
        termId: fixture.school.termId,
        type: 'GUARDIAN_WEEKLY_NOTE',
        audience: 'GUARDIANS',
        title: 'Successor',
        sourceStatus: 'DRAFT',
        capturedByUserId: fixture.authorId,
        typeSpecificSnapshot: source.revision
          .typeSpecificSnapshot as Prisma.InputJsonValue,
        targets: {
          create: { scopeType: 'SCHOOL', identityFingerprint: 'c'.repeat(64) },
        },
      },
    });
    const now = new Date();
    const publication = await prisma.academicContentPublication.create({
      data: {
        schoolId: fixture.school.schoolId,
        academicContentId: source.content.id,
        revisionId: revision.id,
        clientRequestId: randomUUID(),
        requestFingerprint: 'c'.repeat(64),
        status: 'PUBLISHED',
        sourceContentStatus: 'DRAFT',
        publishAt: now,
        publishedAt: now,
        visibleFrom: now,
        supersedesPublicationId: source.publication.id,
        changeSignificance: 'SIGNIFICANT',
        createdByUserId: fixture.authorId,
      },
    });
    await expect(fixture.acknowledge(source)).rejects.toMatchObject({
      httpStatus: 404,
    });
    const successor = { ...source, revision, publication };
    expect(await fixture.acknowledge(successor, false)).toMatchObject({
      status: 'PENDING',
    });
    expect((await fixture.acknowledge(successor)).acknowledgementId).not.toBe(
      first.acknowledgementId,
    );
    expect(
      await prisma.academicContentAcknowledgement.count({
        where: { schoolId: fixture.school.schoolId },
      }),
    ).toBe(2);
  });
  it.each([
    'other-type',
    'malformed',
    'v1',
    'audience',
    'future',
    'expired',
    'cancelled',
    'wrong-precondition',
    'foreign-school',
    'foreign-organization',
  ] as const)(
    'denies %s without an acknowledgement mutation',
    async (condition) => {
      switch (condition) {
        case 'other-type':
          source = { ...source, ...(await fixture.publication()) };
          break;
        case 'malformed':
          await prisma.academicContentRevision.update({
            where: { id: source.revision.id },
            data: {
              typeSpecificSnapshot: {
                type: 'GUARDIAN_WEEKLY_NOTE',
                state: { requiresAcknowledgement: true },
              },
            },
          });
          break;
        case 'v1':
          await prisma.academicContentRevision.update({
            where: { id: source.revision.id },
            data: { snapshotContractVersion: 1 },
          });
          break;
        case 'audience':
          await prisma.academicContentRevision.update({
            where: { id: source.revision.id },
            data: { audience: 'STUDENTS' },
          });
          break;
        case 'future':
          await prisma.academicContentPublication.update({
            where: { id: source.publication.id },
            data: { visibleFrom: new Date(Date.now() + 3600000) },
          });
          break;
        case 'expired':
          await prisma.academicContentPublication.update({
            where: { id: source.publication.id },
            data: { visibleUntil: new Date() },
          });
          break;
        case 'cancelled':
          await prisma.academicContentPublication.update({
            where: { id: source.publication.id },
            data: {
              status: 'CANCELLED',
              cancelledAt: new Date(),
              cancellationReason: 'WITHDRAWN',
            },
          });
          break;
        case 'wrong-precondition':
          source.publication.id = randomUUID();
          break;
        case 'foreign-school':
          source = await fixture.note(true, 1);
          break;
        case 'foreign-organization':
          await prisma.guardian.updateMany({
            where: { id: { in: fixture.guardianIds } },
            data: { organizationId: fixture.schools[2].organizationId },
          });
          break;
      }
      for (const write of [false, true])
        await expect(fixture.acknowledge(source, write)).rejects.toMatchObject({
          httpStatus: 404,
        });
      expect(
        await prisma.academicContentAcknowledgement.count({
          where: { schoolId: fixture.school.schoolId },
        }),
      ).toBe(0);
    },
  );
});

import { randomUUID } from 'node:crypto';
import {
  AcademicContentEngagementEventType as EventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentEngagementService } from '../../src/modules/academics/academic-content/application/academic-content-engagement.service';
import { AcademicContentEngagementRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-engagement.repository';
import { RecordAcademicContentEngagementDto } from '../../src/modules/academics/academic-content/dto/academic-content-engagement.dto';
import { AcademicContentEngagementFixture } from '../fixtures/academic-content-engagement.fixture';

describe('ACC-11B durable live PostgreSQL engagement', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService(),
    second = new PrismaService();
  const fixture = new AcademicContentEngagementFixture(prisma);
  const repository = new AcademicContentEngagementRepository(prisma);
  const service = new AcademicContentEngagementService(repository);
  let source: Awaited<ReturnType<typeof fixture.publication>>;
  function record(
    kind: 'STUDENT' | 'PARENT' = 'STUDENT',
    body: Partial<RecordAcademicContentEngagementDto> = {},
    target = source,
    child = 0,
    writer = service,
  ) {
    return fixture.asActor(
      kind,
      () =>
        writer.record(fixture.context(kind, child), target.content.id, {
          clientRequestId: randomUUID(),
          eventType: EventType.CONTENT_VIEWED,
          expectedPublicationId: target.publication.id,
          ...body,
        }),
      child,
    );
  }
  async function denied(work: Promise<unknown>, status = 404) {
    await expect(work).rejects.toMatchObject({ httpStatus: status });
  }
  async function unchangedEventCount(work: Promise<unknown>, status = 404) {
    const before = await prisma.academicContentEngagementEvent.count({
      where: { schoolId: fixture.school.schoolId },
    });
    await denied(work, status);
    expect(
      await prisma.academicContentEngagementEvent.count({
        where: { schoolId: fixture.school.schoolId },
      }),
    ).toBe(before);
  }
  beforeAll(async () => {
    await Promise.all([prisma.$connect(), second.$connect()]);
    await fixture.create();
    source = await fixture.publication();
  });
  beforeEach(async () => fixture.resetAdmission());
  afterAll(async () => {
    try {
      await fixture.dispose();
    } finally {
      await Promise.all([prisma.$disconnect(), second.$disconnect()]);
    }
  });

  it.each(['STUDENT', 'PARENT'] as const)(
    'records all five explicit interactions for %s without exposing metadata',
    async (kind) => {
      const session = await fixture.publication('ONLINE_SESSION');
      for (const eventType of Object.values(EventType)) {
        const target =
          eventType === EventType.JOIN_LINK_CLICKED ? session : source;
        const result = await record(
          kind,
          {
            eventType,
            ...(eventType.startsWith('FILE_')
              ? { fileId: source.file.id }
              : {}),
            ...(eventType === EventType.LINK_CLICKED
              ? { revisionLinkId: source.link.id }
              : {}),
          },
          target,
        );
        expect(Object.keys(result).sort()).toEqual([
          'eventId',
          'eventType',
          'publicationId',
          'recordedAt',
          'revisionId',
        ]);
        expect(result.publicationId).toBe(target.publication.id);
        const saved =
          await prisma.academicContentEngagementEvent.findUniqueOrThrow({
            where: { id: result.eventId },
          });
        expect(saved.actorUserId).toBe(fixture.context(kind).userId);
        expect(saved.enrollmentId).toBe(fixture.children[0].enrollmentId);
        expect(saved.guardianId).toBe(
          kind === 'PARENT' ? fixture.guardianIds[0] : null,
        );
        expect(saved.createdAt.toISOString()).toBe(result.recordedAt);
      }
      expect(
        await prisma.academicContentAcknowledgement.count({
          where: { schoolId: fixture.school.schoolId },
        }),
      ).toBe(0);
    },
  );
  it('returns the original durable response, normalizes UUID case, and rejects contradictory reuse', async () => {
    const clientRequestId = randomUUID();
    const original = await record('STUDENT', { clientRequestId });
    expect(
      await record('STUDENT', {
        clientRequestId: clientRequestId.toUpperCase(),
      }),
    ).toEqual(original);
    await unchangedEventCount(
      record('STUDENT', {
        clientRequestId,
        eventType: EventType.LINK_CLICKED,
        revisionLinkId: source.link.id,
      }),
      409,
    );
    expect(await record('PARENT', { clientRequestId })).not.toEqual(original);
  });
  it('shares Parent request identity across children and resolves multiple Guardians deterministically', async () => {
    const clientRequestId = randomUUID();
    await record('PARENT', { clientRequestId });
    await unchangedEventCount(
      record('PARENT', { clientRequestId }, source, 1),
      409,
    );
    const first = await record('PARENT', {}, source, 1);
    const event = await prisma.academicContentEngagementEvent.findUniqueOrThrow(
      { where: { id: first.eventId } },
    );
    expect(event.studentId).toBe(fixture.children[1].studentId);
    expect(event.guardianId).toBe(fixture.guardianIds[0]);
  });
  it('rejects stale expected publication and invalid event reference shape', async () => {
    await unchangedEventCount(
      record('STUDENT', { expectedPublicationId: randomUUID() }),
    );
    await unchangedEventCount(
      record('STUDENT', { fileId: source.file.id }),
      400,
    );
    await unchangedEventCount(
      record('STUDENT', { eventType: EventType.LINK_CLICKED }),
      400,
    );
  });
  it('denies foreign School and Organization content and mismatched Student identity', async () => {
    for (const index of [1, 2])
      await unchangedEventCount(
        record(
          'STUDENT',
          {},
          await fixture.publication('GENERAL_RESOURCE', index),
        ),
      );
    await denied(
      fixture.asActor('STUDENT', () =>
        service.record(
          { ...fixture.context(), studentId: fixture.children[1].studentId },
          source.content.id,
          {
            clientRequestId: randomUUID(),
            eventType: EventType.CONTENT_VIEWED,
            expectedPublicationId: source.publication.id,
          },
        ),
      ),
    );
    await denied(record('PARENT', {}, source, 2));
  });
  it.each(['GUARDIANS', 'INTERNAL_STAFF'] as const)(
    'denies Student audience %s',
    async (audience) => {
      await unchangedEventCount(
        record(
          'STUDENT',
          {},
          await fixture.publication('GENERAL_RESOURCE', 0, audience),
        ),
      );
    },
  );
  it('denies Parent Student-only audience, Teacher types, and non-V2 revisions', async () => {
    await unchangedEventCount(
      record(
        'PARENT',
        {},
        await fixture.publication('GENERAL_RESOURCE', 0, 'STUDENTS'),
      ),
    );
    await unchangedEventCount(
      record(
        'STUDENT',
        {},
        await fixture.publication('TEACHER_PREPARATION', 0, 'INTERNAL_STAFF'),
      ),
    );
    const old = await fixture.publication();
    await prisma.academicContentRevision.update({
      where: { id: old.revision.id },
      data: { snapshotContractVersion: 1 },
    });
    await unchangedEventCount(record('STUDENT', {}, old));
  });
  it.each([
    'School',
    'Organization',
    'Actor',
    'Student',
    'Enrollment',
    'Membership',
    'Permission',
    'Guardian',
    'GuardianLink',
    'Term',
  ] as const)(
    'reauthorizes historical retries after %s revocation',
    async (kind) => {
      const clientRequestId = randomUUID(),
        actorKind = kind.startsWith('Guardian') ? 'PARENT' : 'STUDENT';
      await record(actorKind, { clientRequestId });
      const child = fixture.children[0],
        school = fixture.school;
      const mutate = async (revoke: boolean) => {
        const deletedAt = revoke ? new Date() : null;
        switch (kind) {
          case 'School':
            return prisma.school.update({
              where: { id: school.schoolId },
              data: { status: revoke ? 'SUSPENDED' : 'ACTIVE' },
            });
          case 'Organization':
            return prisma.organization.update({
              where: { id: school.organizationId },
              data: { status: revoke ? 'SUSPENDED' : 'ACTIVE' },
            });
          case 'Actor':
            return prisma.user.update({
              where: { id: child.userId },
              data: { status: revoke ? 'DISABLED' : 'ACTIVE' },
            });
          case 'Student':
            return prisma.student.update({
              where: { id: child.studentId },
              data: { deletedAt },
            });
          case 'Enrollment':
            return prisma.enrollment.update({
              where: { id: child.enrollmentId },
              data: { deletedAt },
            });
          case 'Membership':
            return prisma.membership.update({
              where: { id: child.membershipId },
              data: { deletedAt },
            });
          case 'Permission': {
            const permission = await prisma.permission.findUniqueOrThrow({
              where: { code: 'academics.academic_content.view' },
            });
            return revoke
              ? prisma.rolePermission.delete({
                  where: {
                    roleId_permissionId: {
                      roleId: child.roleId,
                      permissionId: permission.id,
                    },
                  },
                })
              : prisma.rolePermission.create({
                  data: { roleId: child.roleId, permissionId: permission.id },
                });
          }
          case 'Guardian':
            return prisma.guardian.updateMany({
              where: { id: { in: fixture.guardianIds } },
              data: { deletedAt },
            });
          case 'GuardianLink':
            return revoke
              ? prisma.studentGuardian.deleteMany({
                  where: {
                    studentId: child.studentId,
                    guardianId: { in: fixture.guardianIds },
                  },
                })
              : prisma.studentGuardian.createMany({
                  data: fixture.guardianIds.map((guardianId) => ({
                    schoolId: school.schoolId,
                    studentId: child.studentId,
                    guardianId,
                  })),
                });
          case 'Term':
            return prisma.enrollment.update({
              where: { id: child.enrollmentId },
              data: { termId: revoke ? null : school.termId },
            });
        }
      };
      await mutate(true);
      try {
        await unchangedEventCount(record(actorKind, { clientRequestId }));
      } finally {
        await mutate(false);
      }
    },
  );
  it.each(['cancelled', 'expired', 'future', 'superseded'] as const)(
    'denies %s publication and historical retries',
    async (state) => {
      const target = await fixture.publication(),
        clientRequestId = randomUUID();
      await record('STUDENT', { clientRequestId }, target);
      await prisma.academicContentPublication.update({
        where: { id: target.publication.id },
        data:
          state === 'cancelled'
            ? {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancellationReason: 'WITHDRAWN',
              }
            : state === 'future'
              ? { visibleFrom: new Date(Date.now() + 60000) }
              : { status: 'EXPIRED', expiredAt: new Date() },
      });
      await unchangedEventCount(record('STUDENT', { clientRequestId }, target));
    },
  );
  it('denies revoked positive SubjectAllocation', async () => {
    const target = await fixture.publication(
      'GENERAL_RESOURCE',
      0,
      'STUDENTS_AND_GUARDIANS',
      true,
    );
    await record('STUDENT', {}, target);
    await prisma.subjectAllocation.updateMany({
      where: { schoolId: fixture.school.schoolId },
      data: { weeklyHours: 0 },
    });
    try {
      await unchangedEventCount(record('STUDENT', {}, target));
    } finally {
      await prisma.subjectAllocation.updateMany({
        where: { schoolId: fixture.school.schoolId },
        data: { weeklyHours: 2 },
      });
    }
  });
  it('denies live Student/Guardian Organization changes after context resolution', async () => {
    await prisma.student.update({
      where: { id: fixture.children[0].studentId },
      data: { organizationId: fixture.schools[1].organizationId },
    });
    try {
      await unchangedEventCount(record());
    } finally {
      await prisma.student.update({
        where: { id: fixture.children[0].studentId },
        data: { organizationId: fixture.school.organizationId },
      });
    }
    await prisma.guardian.updateMany({
      where: { id: { in: fixture.guardianIds } },
      data: { organizationId: fixture.schools[1].organizationId },
    });
    try {
      await unchangedEventCount(record('PARENT'));
    } finally {
      await prisma.guardian.updateMany({
        where: { id: { in: fixture.guardianIds } },
        data: { organizationId: fixture.school.organizationId },
      });
    }
  });
  it('denies changed active Enrollment classroom and inactive Student/Enrollment status', async () => {
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: fixture.school.schoolId,
        sectionId: fixture.school.sectionId,
        nameAr: 'Changed',
        nameEn: 'Changed',
      },
    });
    await prisma.enrollment.update({
      where: { id: fixture.children[0].enrollmentId },
      data: { classroomId: classroom.id },
    });
    try {
      await unchangedEventCount(record());
    } finally {
      await prisma.enrollment.update({
        where: { id: fixture.children[0].enrollmentId },
        data: { classroomId: fixture.school.classroomId },
      });
    }
    await prisma.student.update({
      where: { id: fixture.children[0].studentId },
      data: { status: 'SUSPENDED' },
    });
    try {
      await unchangedEventCount(record());
    } finally {
      await prisma.student.update({
        where: { id: fixture.children[0].studentId },
        data: { status: 'ACTIVE' },
      });
    }
    await prisma.enrollment.update({
      where: { id: fixture.children[0].enrollmentId },
      data: { status: 'WITHDRAWN' },
    });
    try {
      await unchangedEventCount(record());
    } finally {
      await prisma.enrollment.update({
        where: { id: fixture.children[0].enrollmentId },
        data: { status: 'ACTIVE' },
      });
    }
  });
  it('denies missing, foreign, predecessor, public, deleted, and empty Files', async () => {
    const other = await fixture.publication(),
      foreign = await fixture.publication('GENERAL_RESOURCE', 1);
    for (const fileId of [randomUUID(), other.file.id, foreign.file.id])
      await unchangedEventCount(
        record('STUDENT', { eventType: EventType.FILE_DOWNLOADED, fileId }),
      );
    for (const data of [
      { visibility: 'PUBLIC' as const },
      { deletedAt: new Date() },
      { sizeBytes: 0 },
    ]) {
      await prisma.file.update({ where: { id: source.file.id }, data });
      try {
        await unchangedEventCount(
          record('STUDENT', {
            eventType: EventType.FILE_PREVIEWED,
            fileId: source.file.id,
          }),
        );
      } finally {
        await prisma.file.update({
          where: { id: source.file.id },
          data: { visibility: 'PRIVATE', deletedAt: null, sizeBytes: 12 },
        });
      }
    }
  });
  it('enforces live actor-specific download and inline type/policy without signing URLs', async () => {
    await prisma.academicContentFilePolicy.create({
      data: {
        schoolId: fixture.school.schoolId,
        attachmentsEnabled: true,
        maximumFileSizeBytes: 100,
        documentsEnabled: true,
        imagesEnabled: true,
        videosEnabled: true,
        audioEnabled: true,
        archivesEnabled: false,
        otherFilesEnabled: false,
        allowStudentDownload: false,
        allowGuardianDownload: true,
        allowInlinePreview: false,
      },
    });
    try {
      await unchangedEventCount(
        record('STUDENT', {
          eventType: EventType.FILE_DOWNLOADED,
          fileId: source.file.id,
        }),
      );
      await unchangedEventCount(
        record('PARENT', {
          eventType: EventType.FILE_PREVIEWED,
          fileId: source.file.id,
        }),
      );
      await record('PARENT', {
        eventType: EventType.FILE_DOWNLOADED,
        fileId: source.file.id,
      });
      await prisma.academicContentFilePolicy.update({
        where: { schoolId: fixture.school.schoolId },
        data: { allowGuardianDownload: false, allowInlinePreview: true },
      });
      await unchangedEventCount(
        record('PARENT', {
          eventType: EventType.FILE_DOWNLOADED,
          fileId: source.file.id,
        }),
      );
      await prisma.file.update({
        where: { id: source.file.id },
        data: { originalName: 'private.zip', mimeType: 'application/zip' },
      });
      await unchangedEventCount(
        record('STUDENT', {
          eventType: EventType.FILE_PREVIEWED,
          fileId: source.file.id,
        }),
      );
    } finally {
      await prisma.academicContentFilePolicy.delete({
        where: { schoolId: fixture.school.schoolId },
      });
      await prisma.file.update({
        where: { id: source.file.id },
        data: { originalName: 'private.pdf', mimeType: 'application/pdf' },
      });
    }
  });
  it('requires exact immutable RevisionLink and valid ONLINE_SESSION details', async () => {
    for (const target of [
      await fixture.publication(),
      await fixture.publication('GENERAL_RESOURCE', 1),
    ])
      await unchangedEventCount(
        record('STUDENT', {
          eventType: EventType.LINK_CLICKED,
          revisionLinkId: target.link.id,
        }),
      );
    await unchangedEventCount(
      record('STUDENT', { eventType: EventType.JOIN_LINK_CLICKED }),
    );
    const session = await fixture.publication('ONLINE_SESSION');
    const snapshot = session.revision.typeSpecificSnapshot as {
      type: string;
      state: Record<string, Prisma.JsonValue>;
    };
    for (const state of [
      { ...snapshot.state, joinUrl: '' },
      { ...snapshot.state, endAt: new Date(Date.now() - 1).toISOString() },
    ]) {
      await prisma.academicContentRevision.update({
        where: { id: session.revision.id },
        data: { typeSpecificSnapshot: { type: 'ONLINE_SESSION', state } },
      });
      await unchangedEventCount(
        record('STUDENT', { eventType: EventType.JOIN_LINK_CLICKED }, session),
      );
    }
  });
  it('arbitrates concurrent duplicates on independent connections with one durable row', async () => {
    const other = new AcademicContentEngagementService(
        new AcademicContentEngagementRepository(second),
      ),
      clientRequestId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        record(
          'STUDENT',
          { clientRequestId },
          source,
          0,
          i % 2 ? other : service,
        ),
      ),
    );
    expect(new Set(results.map((result) => JSON.stringify(result))).size).toBe(
      1,
    );
    expect(
      await prisma.academicContentEngagementEvent.count({
        where: {
          schoolId: fixture.school.schoolId,
          actorUserId: fixture.children[0].userId,
          clientRequestId,
        },
      }),
    ).toBe(1);
  });
  it('admits exactly the remaining distributed quota, counts retries/denials, and resets the bounded row', async () => {
    const context = fixture.context();
    await prisma.academicContentEngagementAdmission.create({
      data: {
        schoolId: context.schoolId,
        actorUserId: context.userId,
        windowStartedAt: new Date(),
        requestCount: 58,
      },
    });
    const other = new AcademicContentEngagementService(
      new AcademicContentEngagementRepository(second),
    );
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        record('STUDENT', {}, source, 0, i % 2 ? other : service),
      ),
    );
    expect(
      attempts.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(2);
    for (const result of attempts)
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({
          code: 'rate_limit.exceeded',
          httpStatus: 429,
        });
    expect(
      await prisma.academicContentEngagementAdmission.count({
        where: { schoolId: context.schoolId, actorUserId: context.userId },
      }),
    ).toBe(1);
    await prisma.academicContentEngagementAdmission.updateMany({
      where: { schoolId: context.schoolId },
      data: { windowStartedAt: new Date(Date.now() - 61000) },
    });
    const clientRequestId = randomUUID();
    await record('STUDENT', { clientRequestId });
    await record('STUDENT', { clientRequestId });
    await denied(record('STUDENT', { expectedPublicationId: randomUUID() }));
    expect(
      (
        await prisma.academicContentEngagementAdmission.findFirstOrThrow({
          where: { schoolId: context.schoolId, actorUserId: context.userId },
        })
      ).requestCount,
    ).toBe(3);
  });
});

import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceRecipientKind as Kind,
  AcademicContentAudienceType as Audience,
  AcademicContentPublicationStatus as PublicationStatus,
  AcademicContentStatus as ContentStatus,
  AcademicContentTargetScopeType,
  AcademicContentType,
  Prisma,
  PrismaClient,
  UserType,
} from '@prisma/client';
import { academicContentRecipientIdentity } from '../../src/modules/academics/academic-content/domain/academic-content-publication.policy';

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('ACC-7A direct PostgreSQL publication foundation', () => {
  jest.setTimeout(120_000);
  // No application repository or tenancy extension can mask database enforcement.
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
      },
    },
  });
  const ids: Record<string, string> = {};
  const suffix = randomUUID().slice(0, 8);
  const now = new Date('2026-10-02T12:00:00.000Z');
  const fingerprint = 'a'.repeat(64);
  type Context = {
    schoolId: string;
    academicContentId: string;
    revisionId: string;
  };

  async function context(school: 'A' | 'B' = 'A'): Promise<Context> {
    const schoolId = ids[`school${school}`];
    const content = await prisma.academicContent.create({
      data: {
        schoolId,
        academicYearId: ids[`year${school}`],
        termId: ids[`term${school}`],
        type: AcademicContentType.GENERAL_RESOURCE,
        audience: Audience.STUDENTS,
        title: 'Publication foundation',
        createdByUserId: ids.user,
      },
    });
    const revision = await prisma.academicContentRevision.create({
      data: {
        schoolId,
        academicContentId: content.id,
        academicYearId: content.academicYearId,
        termId: content.termId,
        type: content.type,
        audience: content.audience,
        title: content.title,
        revisionNumber: 1,
        snapshotContractVersion: 2,
        sourceStatus: ContentStatus.DRAFT,
        capturedByUserId: ids.user,
      },
    });
    return { schoolId, academicContentId: content.id, revisionId: revision.id };
  }

  async function publication(
    patch: Partial<Prisma.AcademicContentPublicationUncheckedCreateInput> = {},
    parent?: Context,
  ) {
    return prisma.academicContentPublication.create({
      data: {
        ...(parent ?? (await context())),
        clientRequestId: randomUUID(),
        requestFingerprint: fingerprint,
        sourceContentStatus: ContentStatus.DRAFT,
        status: PublicationStatus.SCHEDULED,
        publishAt: now,
        visibleFrom: now,
        createdByUserId: ids.user,
        ...(patch.status === PublicationStatus.CANCELLED
          ? {
              cancellationReason: patch.publishedAt
                ? ('WITHDRAWN' as const)
                : ('UNSCHEDULED' as const),
            }
          : {}),
        ...patch,
      },
    });
  }

  type Publication = Awaited<ReturnType<typeof publication>>;
  function recipientData(
    parent: Publication,
    patch: Partial<Prisma.AcademicContentAudienceRecipientUncheckedCreateInput> = {},
  ): Prisma.AcademicContentAudienceRecipientUncheckedCreateInput {
    const data = {
      schoolId: parent.schoolId,
      publicationId: parent.id,
      revisionId: parent.revisionId,
      recipientKind: Kind.STUDENT,
      studentId: ids.studentA,
      enrollmentId: ids.enrollmentA,
      classroomId: ids.classroomA,
      ...patch,
    };
    const identity =
      data.recipientKind === Kind.STUDENT
        ? academicContentRecipientIdentity({
            recipientKind: Kind.STUDENT,
            enrollmentId: data.enrollmentId,
          })
        : academicContentRecipientIdentity({
            recipientKind: Kind.GUARDIAN,
            enrollmentId: data.enrollmentId,
            studentId: data.studentId,
            guardianId: data.guardianId ?? ids.guardianA,
          });
    return {
      ...data,
      identityFingerprint:
        patch.identityFingerprint ?? identity.identityFingerprint,
    };
  }

  beforeAll(async () => {
    await prisma.$connect();
    ids.organization = (
      await prisma.organization.create({
        data: { name: `ACC7A ${suffix}`, slug: `acc7a-${suffix}` },
      })
    ).id;
    ids.user = (
      await prisma.user.create({
        data: {
          email: `acc7a-${suffix}@example.test`,
          firstName: 'ACC',
          lastName: 'Publisher',
          userType: UserType.SCHOOL_USER,
        },
      })
    ).id;
    for (const school of ['A', 'B']) {
      const schoolId = (
        await prisma.school.create({
          data: {
            organizationId: ids.organization,
            name: `ACC7A ${school}`,
            slug: `acc7a-${school.toLowerCase()}-${suffix}`,
          },
        })
      ).id;
      ids[`school${school}`] = schoolId;
      const yearId = (
        await prisma.academicYear.create({
          data: {
            schoolId,
            nameAr: `Year ${school}`,
            nameEn: `Year ${school}`,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
          },
        })
      ).id;
      ids[`year${school}`] = yearId;
      ids[`term${school}`] = (
        await prisma.term.create({
          data: {
            schoolId,
            academicYearId: yearId,
            nameAr: `Term ${school}`,
            nameEn: `Term ${school}`,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
          },
        })
      ).id;
      const stageId = (
        await prisma.stage.create({
          data: { schoolId, nameAr: 'Stage', nameEn: 'Stage' },
        })
      ).id;
      const gradeId = (
        await prisma.grade.create({
          data: { schoolId, stageId, nameAr: 'Grade', nameEn: 'Grade' },
        })
      ).id;
      const sectionId = (
        await prisma.section.create({
          data: { schoolId, gradeId, nameAr: 'Section', nameEn: 'Section' },
        })
      ).id;
      const classroomId = (
        await prisma.classroom.create({
          data: {
            schoolId,
            sectionId,
            nameAr: 'Classroom',
            nameEn: 'Classroom',
          },
        })
      ).id;
      ids[`classroom${school}`] = classroomId;
      const studentId = (
        await prisma.student.create({
          data: {
            schoolId,
            organizationId: ids.organization,
            firstName: 'Student',
            lastName: school,
          },
        })
      ).id;
      ids[`student${school}`] = studentId;
      ids[`enrollment${school}`] = (
        await prisma.enrollment.create({
          data: {
            schoolId,
            studentId,
            classroomId,
            academicYearId: yearId,
            enrolledAt: now,
          },
        })
      ).id;
      ids[`guardian${school}`] = (
        await prisma.guardian.create({
          data: {
            schoolId,
            organizationId: ids.organization,
            firstName: 'Guardian',
            lastName: school,
            phone: '01000000000',
            relation: 'parent',
          },
        })
      ).id;
    }
  });

  afterAll(async () => {
    const where = {
      schoolId: { in: [ids.schoolA, ids.schoolB].filter(Boolean) },
    };
    await prisma.academicContentAudienceRecipientTarget.deleteMany({ where });
    await prisma.academicContentAudienceRecipient.deleteMany({ where });
    await prisma.academicContentPublication.deleteMany({ where });
    await prisma.academicContentRevisionTarget.deleteMany({ where });
    await prisma.academicContentRevision.deleteMany({ where });
    await prisma.academicContent.deleteMany({ where });
    await prisma.enrollment.deleteMany({ where });
    await prisma.guardian.deleteMany({ where });
    await prisma.student.deleteMany({ where });
    await prisma.classroom.deleteMany({ where });
    await prisma.section.deleteMany({ where });
    await prisma.grade.deleteMany({ where });
    await prisma.stage.deleteMany({ where });
    await prisma.term.deleteMany({ where });
    await prisma.academicYear.deleteMany({ where });
    await prisma.school.deleteMany({ where: { id: where.schoolId } });
    if (ids.user) await prisma.user.delete({ where: { id: ids.user } });
    if (ids.organization)
      await prisma.organization.delete({ where: { id: ids.organization } });
    await prisma.$disconnect();
  });

  it('accepts the exact School/content/revision and rejects foreign ownership and another content revision', async () => {
    const own = await context();
    const otherContent = await context();
    const foreign = await context('B');
    await expect(publication({}, own)).resolves.toMatchObject(own);
    // Historical status isolates ownership FKs from active-row uniqueness.
    const historical = {
      status: PublicationStatus.CANCELLED,
      cancellationReason: 'UNSCHEDULED',
      cancelledAt: now,
    };
    await expect(
      publication(
        { ...historical, academicContentId: foreign.academicContentId },
        own,
      ),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      publication({ ...historical, revisionId: foreign.revisionId }, own),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      publication({ ...historical, revisionId: otherContent.revisionId }, own),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('enforces tenant request id uniqueness and allows the same UUID in another School', async () => {
    const clientRequestId = randomUUID();
    await publication({ clientRequestId });
    await expect(publication({ clientRequestId })).rejects.toMatchObject({
      code: 'P2002',
    });
    await expect(
      publication({ clientRequestId }, await context('B')),
    ).resolves.toMatchObject({ clientRequestId, schoolId: ids.schoolB });
  });

  it('rejects a second SCHEDULED or PUBLISHED publication and permits independent content', async () => {
    const parent = await context();
    await publication({}, parent);
    await expect(publication({}, parent)).rejects.toMatchObject({
      code: 'P2002',
    });
    await expect(
      publication(
        { status: PublicationStatus.PUBLISHED, publishedAt: now },
        parent,
      ),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(publication()).resolves.toMatchObject({
      status: PublicationStatus.SCHEDULED,
    });
  });
  it('keeps CANCELLED/EXPIRED history without blocking a new active publication', async () => {
    const parent = await context();
    await publication(
      {
        status: PublicationStatus.CANCELLED,
        cancellationReason: 'UNSCHEDULED',
        cancelledAt: now,
      },
      parent,
    );
    await publication(
      { status: PublicationStatus.EXPIRED, expiredAt: now },
      parent,
    );
    await expect(publication({}, parent)).resolves.toMatchObject({
      status: PublicationStatus.SCHEDULED,
    });
  });
  it('allows exactly one competing active insertion across separate database connections', async () => {
    const parent = await context();
    const competitor = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });
    try {
      await competitor.$connect();
      const result = await Promise.allSettled([
        publication({}, parent),
        competitor.academicContentPublication.create({
          data: {
            ...parent,
            clientRequestId: randomUUID(),
            requestFingerprint: fingerprint,
            sourceContentStatus: ContentStatus.DRAFT,
            status: PublicationStatus.PUBLISHED,
            publishAt: now,
            visibleFrom: now,
            publishedAt: now,
            createdByUserId: ids.user,
          },
        }),
      ]);
      expect(
        result.filter((entry) => entry.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = result.find(
        (entry) => entry.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ code: 'P2002' });
      expect(
        await prisma.academicContentPublication.count({
          where: {
            schoolId: parent.schoolId,
            academicContentId: parent.academicContentId,
          },
        }),
      ).toBe(1);
    } finally {
      await competitor.$disconnect();
    }
  });

  it.each([
    { visibleFrom: new Date(now.getTime() - 1) },
    { visibleUntil: now },
    { visibleUntil: new Date(now.getTime() - 1) },
  ])('directly protects acc_publication_timing_check %j', async (patch) => {
    await expect(publication(patch)).rejects.toThrow(
      'acc_publication_timing_check',
    );
  });
  it('accepts equal/later visibleFrom and a null or later visibleUntil', async () => {
    await expect(publication()).resolves.toMatchObject({
      visibleFrom: now,
      visibleUntil: null,
    });
    await expect(
      publication({
        visibleFrom: new Date(now.getTime() + 1),
        visibleUntil: new Date(now.getTime() + 2),
      }),
    ).resolves.toBeDefined();
  });
  it.each(Object.values(ContentStatus))(
    'directly protects acc_publication_source_status_check for %s',
    async (sourceContentStatus) => {
      const write = publication({ sourceContentStatus });
      if (
        [ContentStatus.DRAFT, ContentStatus.APPROVED].includes(
          sourceContentStatus as 'DRAFT' | 'APPROVED',
        )
      )
        await expect(write).resolves.toMatchObject({ sourceContentStatus });
      else
        await expect(write).rejects.toThrow(
          'acc_publication_source_status_check',
        );
    },
  );

  const lifecycleCases = Object.values(PublicationStatus).flatMap((status) =>
    Array.from({ length: 8 }, (_, mask) => ({
      status,
      publishedAt: mask & 1 ? now : null,
      expiredAt: mask & 2 ? now : null,
      cancelledAt: mask & 4 ? now : null,
      valid:
        status === PublicationStatus.SCHEDULED
          ? mask === 0
          : status === PublicationStatus.PUBLISHED
            ? mask === 1
            : status === PublicationStatus.EXPIRED
              ? mask === 2 || mask === 3
              : mask === 4 || mask === 5,
    })),
  );
  it.each(lifecycleCases)(
    'directly protects acc_publication_lifecycle_check %j',
    async ({ valid, ...patch }) => {
      if (valid) await expect(publication(patch)).resolves.toMatchObject(patch);
      else
        await expect(publication(patch)).rejects.toThrow(
          'acc_publication_lifecycle_check',
        );
    },
  );
  it.each(['studentRecipientCount', 'guardianRecipientContextCount'] as const)(
    'rejects a negative %s',
    async (field) => {
      await expect(publication({ [field]: -1 })).rejects.toThrow(
        'acc_publication_counts_nonnegative_check',
      );
    },
  );
  it('accepts zero and positive recipient counts', async () => {
    await expect(publication()).resolves.toMatchObject({
      studentRecipientCount: 0,
      guardianRecipientContextCount: 0,
    });
    await expect(
      publication({
        studentRecipientCount: 3,
        guardianRecipientContextCount: 4,
      }),
    ).resolves.toMatchObject({
      studentRecipientCount: 3,
      guardianRecipientContextCount: 4,
    });
  });
  it.each(['', 'a'.repeat(63), 'G'.repeat(64), 'A'.repeat(64)])(
    'rejects malformed request fingerprint %s',
    async (requestFingerprint) => {
      await expect(publication({ requestFingerprint })).rejects.toThrow(
        'acc_publication_request_fingerprint_check',
      );
    },
  );

  it('accepts nullable account contexts, false guardian notification preference, and both recipient shapes', async () => {
    const parent = await publication();
    await expect(
      prisma.academicContentAudienceRecipient.create({
        data: recipientData(parent),
      }),
    ).resolves.toMatchObject({
      recipientKind: Kind.STUDENT,
      guardianId: null,
      recipientUserId: null,
    });
    await expect(
      prisma.academicContentAudienceRecipient.create({
        data: recipientData(parent, {
          recipientKind: Kind.GUARDIAN,
          guardianId: ids.guardianA,
          guardianCanReceiveNotifications: false,
        }),
      }),
    ).resolves.toMatchObject({
      recipientKind: Kind.GUARDIAN,
      recipientUserId: null,
      guardianCanReceiveNotifications: false,
    });
  });
  it.each([
    { recipientKind: Kind.STUDENT, guardianId: 'guardian' },
    { recipientKind: Kind.GUARDIAN, guardianId: null },
  ])(
    'directly protects acc_audience_recipient_shape_check %j',
    async (patch) => {
      const parent = await publication();
      await expect(
        prisma.academicContentAudienceRecipient.create({
          data: recipientData(parent, {
            ...patch,
            guardianId: patch.guardianId ? ids.guardianA : null,
          }),
        }),
      ).rejects.toThrow('acc_audience_recipient_shape_check');
    },
  );
  it.each(['', 'a'.repeat(63), 'x'.repeat(64), 'A'.repeat(64)])(
    'rejects malformed recipient fingerprint %s',
    async (identityFingerprint) => {
      await expect(
        prisma.academicContentAudienceRecipient.create({
          data: recipientData(await publication(), { identityFingerprint }),
        }),
      ).rejects.toThrow('acc_audience_recipient_identity_fingerprint_check');
    },
  );
  it.each(['studentId', 'enrollmentId', 'classroomId', 'guardianId'] as const)(
    'rejects a cross-School recipient %s',
    async (field) => {
      const foreignId = {
        studentId: ids.studentB,
        enrollmentId: ids.enrollmentB,
        classroomId: ids.classroomB,
        guardianId: ids.guardianB,
      }[field];
      await expect(
        prisma.academicContentAudienceRecipient.create({
          data: recipientData(await publication(), {
            recipientKind: Kind.GUARDIAN,
            guardianId: ids.guardianA,
            [field]: foreignId,
          }),
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    },
  );
  it('rejects a recipient revision inconsistent with its publication', async () => {
    const parent = await publication();
    await expect(
      prisma.academicContentAudienceRecipient.create({
        data: recipientData(parent, {
          revisionId: (await context()).revisionId,
        }),
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const foreign = await publication({}, await context('B'));
    await expect(
      prisma.academicContentAudienceRecipient.create({
        data: recipientData(parent, {
          publicationId: foreign.id,
          revisionId: foreign.revisionId,
        }),
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
  it.each([Kind.STUDENT, Kind.GUARDIAN])(
    'deduplicates overlapping targets by canonical %s context within a publication',
    async (recipientKind) => {
      const parent = await publication();
      const patch =
        recipientKind === Kind.GUARDIAN
          ? { recipientKind, guardianId: ids.guardianA }
          : { recipientKind };
      const data = recipientData(parent, patch);
      await prisma.academicContentAudienceRecipient.create({ data });
      await expect(
        prisma.academicContentAudienceRecipient.create({ data }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.academicContentAudienceRecipient.create({
          data: recipientData(await publication(), patch),
        }),
      ).resolves.toBeDefined();
    },
  );
  it('preserves a historical account UUID after account deletion and accepts an absent account UUID', async () => {
    const user = await prisma.user.create({
      data: {
        email: `acc7a-history-${suffix}@example.test`,
        firstName: 'Historical',
        lastName: 'Account',
        userType: UserType.STUDENT,
      },
    });
    const recipient = await prisma.academicContentAudienceRecipient.create({
      data: recipientData(await publication(), { recipientUserId: user.id }),
    });
    await prisma.user.delete({ where: { id: user.id } });
    expect(
      await prisma.academicContentAudienceRecipient.findUniqueOrThrow({
        where: { id: recipient.id },
      }),
    ).toMatchObject({ recipientUserId: user.id });
    await expect(
      prisma.academicContentAudienceRecipient.create({
        data: recipientData(await publication(), {
          recipientUserId: randomUUID(),
        }),
      }),
    ).resolves.toBeDefined();
  });
  it('uses Restrict for publication actor history', async () => {
    const actor = await prisma.user.create({
      data: {
        email: `acc7a-actor-${suffix}@example.test`,
        firstName: 'Historical',
        lastName: 'Actor',
        userType: UserType.SCHOOL_USER,
      },
    });
    const created = await publication({
      status: PublicationStatus.CANCELLED,
      cancellationReason: 'UNSCHEDULED',
      cancelledAt: now,
      cancelledByUserId: actor.id,
    });
    await expect(
      prisma.user.delete({ where: { id: actor.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await prisma.academicContentPublication.delete({
      where: { id: created.id },
    });
    await prisma.user.delete({ where: { id: actor.id } });
    await publication();
    await expect(
      prisma.user.delete({ where: { id: ids.user } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('accepts same-revision target attribution, rejects another revision even when the inserted revisionId is falsified, and deduplicates attribution', async () => {
    const parent = await publication();
    const revision = await prisma.academicContentRevision.findUniqueOrThrow({
      where: { id: parent.revisionId },
    });
    const secondRevision = await prisma.academicContentRevision.create({
      data: {
        schoolId: revision.schoolId,
        academicContentId: revision.academicContentId,
        academicYearId: revision.academicYearId,
        termId: revision.termId,
        type: revision.type,
        audience: revision.audience,
        title: revision.title,
        revisionNumber: 2,
        snapshotContractVersion: revision.snapshotContractVersion,
        sourceStatus: revision.sourceStatus,
        capturedByUserId: revision.capturedByUserId,
      },
    });
    const recipient = await prisma.academicContentAudienceRecipient.create({
      data: recipientData(parent),
    });
    const ownTarget = await prisma.academicContentRevisionTarget.create({
      data: {
        schoolId: parent.schoolId,
        revisionId: parent.revisionId,
        scopeType: AcademicContentTargetScopeType.SCHOOL,
        identityFingerprint: 'school',
      },
    });
    const otherTarget = await prisma.academicContentRevisionTarget.create({
      data: {
        schoolId: parent.schoolId,
        revisionId: secondRevision.id,
        scopeType: AcademicContentTargetScopeType.SCHOOL,
        identityFingerprint: 'school',
      },
    });
    const data = {
      schoolId: parent.schoolId,
      recipientId: recipient.id,
      revisionId: parent.revisionId,
      revisionTargetId: ownTarget.id,
    };
    await expect(
      prisma.academicContentAudienceRecipientTarget.create({ data }),
    ).resolves.toMatchObject(data);
    await expect(
      prisma.academicContentAudienceRecipientTarget.create({ data }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.academicContentAudienceRecipientTarget.create({
        data: { ...data, revisionTargetId: otherTarget.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.academicContentAudienceRecipientTarget.create({
        data: {
          ...data,
          revisionId: secondRevision.id,
          revisionTargetId: otherTarget.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const foreign = await context('B');
    const foreignTarget = await prisma.academicContentRevisionTarget.create({
      data: {
        schoolId: foreign.schoolId,
        revisionId: foreign.revisionId,
        scopeType: AcademicContentTargetScopeType.SCHOOL,
        identityFingerprint: 'school',
      },
    });
    await expect(
      prisma.academicContentAudienceRecipientTarget.create({
        data: { ...data, revisionTargetId: foreignTarget.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});

import { randomUUID } from 'node:crypto';
import { Prisma, AcademicContentType } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { schoolScopeExtension } from '../../src/infrastructure/database/school-scope.extension';
import {
  academicContentEngagementRequestFingerprint,
  academicContentEngagementRetryResult,
} from '../../src/modules/academics/academic-content/domain/academic-content-engagement.policy';
import { AcademicContentCurrentAccessService } from '../../src/modules/academics/academic-content/application/academic-content-current-access.service';
import { AcademicContentAudienceRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-audience.repository';
import { AcademicContentRecipientReadRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-recipient-read.repository';
import { StudentAcademicContentPresenter } from '../../src/modules/student-app/academic-content/presenters/student-academic-content.presenter';
import { ParentAcademicContentPresenter } from '../../src/modules/parent-app/academic-content/presenters/parent-academic-content.presenter';
import { hasRetainedFileReferences } from '../../src/modules/files/shared/infrastructure/file-lifetime.repository';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';

describe('ACC-11A real PostgreSQL historical action foundation', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService();
  const second = new PrismaService();
  const organizationId = randomUUID(),
    authorId = randomUUID();
  const parentUserId = randomUUID(),
    otherParentId = randomUUID();
  const now = new Date();
  const schoolIds = [randomUUID(), randomUUID()];
  const users: string[] = [authorId, parentUserId, otherParentId];
  const children: {
    studentId: string;
    enrollmentId: string;
    userId: string;
  }[] = [];
  const contexts: {
    schoolId: string;
    yearId: string;
    termId: string;
    classroomId: string;
    guardianId: string;
  }[] = [];
  let first: Awaited<ReturnType<typeof publication>>;
  let other: Awaited<ReturnType<typeof publication>>;
  let foreign: Awaited<ReturnType<typeof publication>>;
  let fileId: string, foreignFileId: string, alternateGuardianId: string;

  async function publication(
    index: number,
    type: AcademicContentType = 'GENERAL_RESOURCE',
  ) {
    const { schoolId, yearId, termId } = contexts[index];
    const content = await prisma.academicContent.create({
      data: {
        schoolId,
        academicYearId: yearId,
        termId,
        type,
        audience: 'STUDENTS_AND_GUARDIANS',
        title: 'Published source',
        createdByUserId: authorId,
      },
    });
    const revision = await prisma.academicContentRevision.create({
      data: {
        schoolId,
        academicContentId: content.id,
        academicYearId: yearId,
        termId,
        type,
        audience: 'STUDENTS_AND_GUARDIANS',
        title: 'Published source',
        revisionNumber: 1,
        snapshotContractVersion: 2,
        sourceStatus: 'DRAFT',
        capturedByUserId: authorId,
        targets: {
          create: {
            scopeType: 'SCHOOL',
            identityFingerprint: 'a'.repeat(64),
          },
        },
      },
    });
    const pub = await prisma.academicContentPublication.create({
      data: {
        schoolId,
        academicContentId: content.id,
        revisionId: revision.id,
        clientRequestId: randomUUID(),
        requestFingerprint: 'a'.repeat(64),
        sourceContentStatus: 'DRAFT',
        status: 'PUBLISHED',
        publishAt: now,
        publishedAt: now,
        visibleFrom: now,
        createdByUserId: authorId,
      },
    });
    const link = await prisma.academicContentRevisionLink.create({
      data: {
        schoolId,
        revisionId: revision.id,
        label: 'Published',
        url: 'https://example.test/published',
        sortOrder: 0,
      },
    });
    return { content, revision, pub, link };
  }
  function eventData(
    parent = false,
    child = 0,
  ): Prisma.AcademicContentEngagementEventUncheckedCreateInput {
    const attribution = {
      schoolId: schoolIds[0],
      academicContentId: first.content.id,
      publicationId: first.pub.id,
      revisionId: first.revision.id,
      actorUserId: parent ? parentUserId : children[child].userId,
      actorKind: parent ? ('PARENT' as const) : ('STUDENT' as const),
      studentId: children[child].studentId,
      enrollmentId: children[child].enrollmentId,
      guardianId: parent ? contexts[0].guardianId : null,
    };
    const command = {
      eventType: 'CONTENT_VIEWED' as const,
      clientRequestId: randomUUID(),
    };
    return {
      ...attribution,
      ...command,
      requestFingerprint: academicContentEngagementRequestFingerprint(
        attribution,
        command,
      ),
    };
  }
  function ackData(
    child = 0,
  ): Prisma.AcademicContentAcknowledgementUncheckedCreateInput {
    return {
      schoolId: schoolIds[0],
      academicContentId: first.content.id,
      publicationId: first.pub.id,
      revisionId: first.revision.id,
      actorUserId: parentUserId,
      studentId: children[child].studentId,
      enrollmentId: children[child].enrollmentId,
      guardianId: contexts[0].guardianId,
    };
  }
  async function rejected(work: Promise<unknown>, code = 'P2003') {
    await expect(work).rejects.toMatchObject({ code });
  }

  beforeAll(async () => {
    await Promise.all([prisma.$connect(), second.$connect()]);
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: 'ACC11A',
        slug: `acc11a-${organizationId}`,
      },
    });
    await prisma.user.createMany({
      data: users.map((id, i) => ({
        id,
        userType: i === 0 ? ('SCHOOL_USER' as const) : ('PARENT' as const),
        email: `${id}@acc11a.test`,
        firstName: 'Actor',
        lastName: 'Fixture',
      })),
    });
    for (let index = 0; index < 2; index++) {
      const schoolId = schoolIds[index];
      await prisma.school.create({
        data: {
          id: schoolId,
          organizationId,
          name: 'Fixture',
          slug: `acc11a-${schoolId}`,
        },
      });
      const year = await prisma.academicYear.create({
        data: {
          schoolId,
          nameAr: 'Year',
          nameEn: 'Year',
          startDate: new Date(now.getTime() - 86400000),
          endDate: new Date(now.getTime() + 86400000),
        },
      });
      const term = await prisma.term.create({
        data: {
          schoolId,
          academicYearId: year.id,
          nameAr: 'Term',
          nameEn: 'Term',
          isActive: true,
          startDate: year.startDate,
          endDate: year.endDate,
        },
      });
      const stage = await prisma.stage.create({
        data: { schoolId, nameAr: 'Stage', nameEn: 'Stage' },
      });
      const grade = await prisma.grade.create({
        data: { schoolId, stageId: stage.id, nameAr: 'Grade', nameEn: 'Grade' },
      });
      const section = await prisma.section.create({
        data: {
          schoolId,
          gradeId: grade.id,
          nameAr: 'Section',
          nameEn: 'Section',
        },
      });
      const classroom = await prisma.classroom.create({
        data: {
          schoolId,
          sectionId: section.id,
          nameAr: 'Classroom',
          nameEn: 'Classroom',
        },
      });
      const guardian = await prisma.guardian.create({
        data: {
          schoolId,
          organizationId,
          userId: parentUserId,
          firstName: 'Parent',
          lastName: 'Fixture',
          phone: 'fixture',
          relation: 'parent',
        },
      });
      contexts.push({
        schoolId,
        yearId: year.id,
        termId: term.id,
        classroomId: classroom.id,
        guardianId: guardian.id,
      });
      for (let child = 0; child < (index === 0 ? 2 : 1); child++) {
        const user = await prisma.user.create({
          data: {
            userType: 'STUDENT',
            email: `${randomUUID()}@acc11a.test`,
            firstName: 'Student',
            lastName: 'Fixture',
          },
        });
        users.push(user.id);
        const student = await prisma.student.create({
          data: {
            schoolId,
            organizationId,
            userId: user.id,
            firstName: 'Child',
            lastName: 'Fixture',
          },
        });
        const enrollment = await prisma.enrollment.create({
          data: {
            schoolId,
            studentId: student.id,
            academicYearId: year.id,
            termId: term.id,
            classroomId: classroom.id,
            enrolledAt: now,
          },
        });
        await prisma.studentGuardian.create({
          data: { schoolId, studentId: student.id, guardianId: guardian.id },
        });
        children.push({
          studentId: student.id,
          enrollmentId: enrollment.id,
          userId: user.id,
        });
      }
    }
    alternateGuardianId = (
      await prisma.guardian.create({
        data: {
          schoolId: schoolIds[0],
          organizationId,
          userId: parentUserId,
          firstName: 'Alternate',
          lastName: 'Guardian',
          phone: 'fixture-2',
          relation: 'parent',
        },
      })
    ).id;
    first = await publication(0);
    other = await publication(0);
    foreign = await publication(1);
    fileId = (
      await prisma.file.create({
        data: {
          schoolId: schoolIds[0],
          organizationId,
          uploaderId: authorId,
          bucket: 'fixture',
          objectKey: randomUUID(),
          originalName: 'file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12,
          visibility: 'PRIVATE',
        },
      })
    ).id;
    await prisma.academicContentRevisionAsset.create({
      data: {
        schoolId: schoolIds[0],
        revisionId: first.revision.id,
        fileId,
        sortOrder: 0,
      },
    });
    foreignFileId = (
      await prisma.file.create({
        data: {
          schoolId: schoolIds[1],
          organizationId,
          uploaderId: authorId,
          bucket: 'fixture',
          objectKey: randomUUID(),
          originalName: 'foreign.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12,
          visibility: 'PRIVATE',
        },
      })
    ).id;
    await prisma.academicContentRevisionAsset.create({
      data: {
        schoolId: schoolIds[1],
        revisionId: foreign.revision.id,
        fileId: foreignFileId,
        sortOrder: 0,
      },
    });
  });

  afterAll(async () => {
    const where = { schoolId: { in: schoolIds } };
    try {
      await prisma.academicContentEngagementEvent.deleteMany({ where });
      await prisma.academicContentAcknowledgement.deleteMany({ where });
      await prisma.academicContentRevisionAsset.deleteMany({ where });
      await prisma.academicContentRevisionLink.deleteMany({ where });
      await prisma.academicContentPublication.deleteMany({
        where: { ...where, supersedesPublicationId: { not: null } },
      });
      await prisma.academicContentPublication.deleteMany({ where });
      await prisma.academicContentRevisionTarget.deleteMany({ where });
      await prisma.academicContentRevision.deleteMany({ where });
      await prisma.academicContent.deleteMany({ where });
      await prisma.file.deleteMany({ where });
      await prisma.studentGuardian.deleteMany({ where });
      await prisma.guardian.deleteMany({ where });
      await prisma.enrollment.deleteMany({ where });
      await prisma.student.deleteMany({ where });
      await prisma.classroom.deleteMany({ where });
      await prisma.section.deleteMany({ where });
      await prisma.grade.deleteMany({ where });
      await prisma.stage.deleteMany({ where });
      await prisma.term.deleteMany({ where });
      await prisma.academicYear.deleteMany({ where });
      await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.organization.delete({ where: { id: organizationId } });
    } finally {
      await Promise.all([prisma.$disconnect(), second.$disconnect()]);
    }
  });

  it('verifies migrated checks, restrictive FKs and supporting unique indexes', async () => {
    const constraints = await prisma.$queryRaw<
      {
        name: string;
        kind: string;
        validated: boolean;
        deleteAction: string;
        updateAction: string;
      }[]
    >`SELECT conname AS name, contype::text AS kind, convalidated AS validated,
      confdeltype::text AS "deleteAction", confupdtype::text AS "updateAction"
      FROM pg_constraint WHERE conrelid IN (
        'public.academic_content_engagement_events'::regclass,
        'public.academic_content_acknowledgements'::regclass
      ) AND contype IN ('c', 'f')`;
    expect(
      constraints
        .filter((c) => c.kind === 'c')
        .map((c) => c.name)
        .sort(),
    ).toEqual([
      'acc_engagement_actor_guardian_check',
      'acc_engagement_reference_shape_check',
      'acc_engagement_request_fingerprint_check',
    ]);
    expect(constraints.every((c) => c.validated)).toBe(true);
    const foreignKeys = constraints.filter((c) => c.kind === 'f');
    expect(foreignKeys).toHaveLength(16);
    expect(
      foreignKeys.every(
        (c) => c.deleteAction === 'r' && c.updateAction === 'r',
      ),
    ).toBe(true);
    const names = [
      'acc_engagement_actor_request_key',
      'acc_acknowledgement_parent_child_publication_key',
      'acc_revision_link_identity_key',
      'acc_enrollment_student_identity_key',
    ];
    const indexes = await prisma.$queryRaw<
      { name: string; valid: boolean; unique: boolean }[]
    >(Prisma.sql`
      SELECT c.relname AS name, i.indisvalid AS valid, i.indisunique AS unique
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname IN (${Prisma.join(names)})`);
    expect(indexes.map((i) => i.name).sort()).toEqual([...names].sort());
    expect(indexes.every((i) => i.valid && i.unique)).toBe(true);
  });

  it('enforces one actor-scoped logical event under two independent PostgreSQL connections', async () => {
    const data = eventData();
    const results = await Promise.allSettled([
      prisma.academicContentEngagementEvent.create({ data }),
      second.academicContentEngagementEvent.create({ data }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((r) => r.status === 'rejected');
    expect(failure).toMatchObject({
      status: 'rejected',
      reason: { code: 'P2002' },
    });
    const stored = await prisma.academicContentEngagementEvent.findFirstOrThrow(
      {
        where: {
          schoolId: data.schoolId,
          actorUserId: data.actorUserId,
          clientRequestId: data.clientRequestId,
        },
      },
    );
    expect(
      academicContentEngagementRetryResult(stored, {
        schoolId: data.schoolId,
        actorUserId: data.actorUserId,
        clientRequestId: data.clientRequestId,
        requestFingerprint: data.requestFingerprint,
      }),
    ).toBe('IDENTICAL');
    await rejected(
      prisma.academicContentEngagementEvent.create({
        data: {
          ...data,
          requestFingerprint: 'b'.repeat(64),
          studentId: children[1].studentId,
          enrollmentId: children[1].enrollmentId,
        },
      }),
      'P2002',
    );
    expect(
      academicContentEngagementRetryResult(stored, {
        ...stored,
        requestFingerprint: 'b'.repeat(64),
      }),
    ).toBe('CONFLICT');
    expect(
      await prisma.academicContentEngagementEvent.count({
        where: {
          actorUserId: data.actorUserId,
          clientRequestId: data.clientRequestId,
        },
      }),
    ).toBe(1);
  });
  it('keeps Student and Parent actors independent and binds Parent requests to an exact child', async () => {
    const student = eventData(),
      parent = { ...eventData(true), clientRequestId: student.clientRequestId };
    await prisma.academicContentEngagementEvent.create({ data: student });
    await prisma.academicContentEngagementEvent.create({ data: parent });
    await rejected(
      prisma.academicContentEngagementEvent.create({
        data: {
          ...eventData(true, 1),
          clientRequestId: parent.clientRequestId,
        },
      }),
      'P2002',
    );
    const childB = await prisma.academicContentEngagementEvent.create({
      data: eventData(true, 1),
    });
    expect(childB.studentId).toBe(children[1].studentId);
  });
  it('uses Parent account + child + publication uniqueness, independent of Guardian record/enrollment', async () => {
    const data = ackData();
    const results = await Promise.allSettled([
      prisma.academicContentAcknowledgement.create({ data }),
      second.academicContentAcknowledgement.create({ data }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'P2002' },
    });
    await rejected(
      prisma.academicContentAcknowledgement.create({
        data: { ...data, guardianId: alternateGuardianId },
      }),
      'P2002',
    );
    const anotherEnrollment = await prisma.enrollment.create({
      data: {
        schoolId: schoolIds[0],
        studentId: children[0].studentId,
        academicYearId: contexts[0].yearId,
        termId: contexts[0].termId,
        classroomId: contexts[0].classroomId,
        enrolledAt: now,
        status: 'WITHDRAWN',
        endedAt: now,
      },
    });
    await rejected(
      prisma.academicContentAcknowledgement.create({
        data: { ...data, enrollmentId: anotherEnrollment.id },
      }),
      'P2002',
    );
    const childB = await prisma.academicContentAcknowledgement.create({
      data: ackData(1),
    });
    const otherParent = await prisma.academicContentAcknowledgement.create({
      data: { ...data, actorUserId: otherParentId },
    });
    expect(childB.studentId).not.toBe(data.studentId);
    expect(otherParent.actorUserId).not.toBe(data.actorUserId);
  });
  it.each([
    'school',
    'content',
    'revision',
    'publication',
    'foreignStudent',
    'foreignEnrollment',
    'otherChildEnrollment',
    'foreignGuardian',
  ])(
    'rejects inconsistent %s attribution for both historical models',
    async (change) => {
      const patch: Partial<Prisma.AcademicContentAcknowledgementUncheckedCreateInput> =
        {};
      if (change === 'school') patch.schoolId = schoolIds[1];
      if (change === 'content') patch.academicContentId = other.content.id;
      if (change === 'revision') patch.revisionId = other.revision.id;
      if (change === 'publication') patch.publicationId = foreign.pub.id;
      if (change === 'foreignStudent') patch.studentId = children[2].studentId;
      if (change === 'foreignEnrollment')
        patch.enrollmentId = children[2].enrollmentId;
      if (change === 'otherChildEnrollment')
        patch.enrollmentId = children[1].enrollmentId;
      if (change === 'foreignGuardian')
        patch.guardianId = contexts[1].guardianId;
      await rejected(
        prisma.academicContentEngagementEvent.create({
          data: { ...eventData(true), ...patch },
        }),
      );
      // Different Parent account avoids an unrelated natural-key conflict hiding the FK proof.
      await rejected(
        prisma.academicContentAcknowledgement.create({
          data: { ...ackData(), actorUserId: authorId, ...patch },
        }),
      );
    },
  );
  it('requires exact RevisionAsset and RevisionLink tuples and retains the existing live File graph', async () => {
    await prisma.academicContentEngagementEvent.create({
      data: { ...eventData(), eventType: 'FILE_PREVIEWED', fileId },
    });
    await prisma.academicContentEngagementEvent.create({
      data: { ...eventData(), eventType: 'FILE_DOWNLOADED', fileId },
    });
    for (const patch of [
      {
        revisionId: other.revision.id,
        publicationId: other.pub.id,
        academicContentId: other.content.id,
      },
      { fileId: randomUUID() },
      { fileId: foreignFileId },
    ])
      await rejected(
        prisma.academicContentEngagementEvent.create({
          data: {
            ...eventData(),
            eventType: 'FILE_DOWNLOADED',
            fileId,
            ...patch,
          },
        }),
      );
    await prisma.academicContentEngagementEvent.create({
      data: {
        ...eventData(),
        eventType: 'LINK_CLICKED',
        revisionLinkId: first.link.id,
      },
    });
    for (const revisionLinkId of [other.link.id, foreign.link.id, randomUUID()])
      await rejected(
        prisma.academicContentEngagementEvent.create({
          data: { ...eventData(), eventType: 'LINK_CLICKED', revisionLinkId },
        }),
      );
    expect(await hasRetainedFileReferences(prisma, fileId)).toBe(true);
    await rejected(
      prisma.academicContentRevisionAsset.delete({
        where: {
          schoolId_revisionId_fileId: {
            schoolId: schoolIds[0],
            revisionId: first.revision.id,
            fileId,
          },
        },
      }),
    );
  });
  it.each([
    { eventType: 'CONTENT_VIEWED' as const, fileId: () => fileId },
    { eventType: 'FILE_PREVIEWED' as const },
    { eventType: 'LINK_CLICKED' as const },
    {
      eventType: 'JOIN_LINK_CLICKED' as const,
      revisionLinkId: () => first.link.id,
    },
  ])('database checks reject event shape %s', async (shape) => {
    await expect(
      prisma.academicContentEngagementEvent.create({
        data: {
          ...eventData(),
          eventType: shape.eventType,
          fileId: shape.fileId?.(),
          revisionLinkId: shape.revisionLinkId?.(),
        },
      }),
    ).rejects.toThrow();
  });
  it('database checks reject Parent without Guardian, Student with Guardian and malformed fingerprint', async () => {
    for (const data of [
      { ...eventData(true), guardianId: null },
      { ...eventData(), guardianId: contexts[0].guardianId },
      { ...eventData(), requestFingerprint: 'invalid' },
    ])
      await expect(
        prisma.academicContentEngagementEvent.create({ data }),
      ).rejects.toThrow();
  });
  it('schoolScope fences new model reads and supported writes against a foreign tenant', async () => {
    const data = eventData();
    const event = await prisma.academicContentEngagementEvent.create({ data });
    const ack = await prisma.academicContentAcknowledgement.findFirstOrThrow({
      where: { schoolId: schoolIds[0] },
    });
    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: authorId, userType: 'SCHOOL_USER' });
      setActiveMembership({
        membershipId: randomUUID(),
        roleId: randomUUID(),
        organizationId,
        schoolId: schoolIds[1],
        permissions: [],
      });
      const scoped = prisma.$extends(schoolScopeExtension);
      expect(
        await scoped.academicContentEngagementEvent.findMany({
          where: { id: event.id },
        }),
      ).toEqual([]);
      expect(
        await scoped.academicContentAcknowledgement.findMany({
          where: { id: ack.id },
        }),
      ).toEqual([]);
      expect(
        (
          await scoped.academicContentEngagementEvent.updateMany({
            where: { id: event.id },
            data: { requestFingerprint: 'b'.repeat(64) },
          })
        ).count,
      ).toBe(0);
      expect(
        (
          await scoped.academicContentAcknowledgement.deleteMany({
            where: { id: ack.id },
          })
        ).count,
      ).toBe(0);
    });
    expect(
      (
        await prisma.academicContentEngagementEvent.findUniqueOrThrow({
          where: { id: event.id },
        })
      ).requestFingerprint,
    ).toBe(data.requestFingerprint);
    expect(
      await prisma.academicContentAcknowledgement.findUnique({
        where: { id: ack.id },
      }),
    ).not.toBeNull();
  });
  it('projects the exact current RevisionLink ID for both authorized recipient details', async () => {
    const before = await prisma.academicContentEngagementEvent.count({
      where: { schoolId: schoolIds[0] },
    });
    const reads = new AcademicContentRecipientReadRepository(prisma);
    const service = new AcademicContentCurrentAccessService(
      reads,
      new AcademicContentAudienceRepository(prisma),
    );
    const common = {
      schoolId: schoolIds[0],
      studentId: children[0].studentId,
      enrollmentId: children[0].enrollmentId,
      classroomId: contexts[0].classroomId,
      academicYearId: contexts[0].yearId,
      termId: contexts[0].termId,
    };
    const student = StudentAcademicContentPresenter.presentDetail(
      await service.getCurrentStudentContent(
        { ...common, actorKind: 'STUDENT', userId: children[0].userId },
        first.content.id,
      ),
    );
    const parent = ParentAcademicContentPresenter.presentDetail(
      await service.getCurrentParentContent(
        {
          ...common,
          actorKind: 'PARENT',
          userId: parentUserId,
          guardianIds: [contexts[0].guardianId],
        },
        first.content.id,
      ),
    );
    const link = {
      revisionLinkId: first.link.id,
      label: 'Published',
      url: 'https://example.test/published',
      sortOrder: 0,
    };
    expect(student.content.links).toEqual([link]);
    expect(parent.content.links).toEqual([link]);
    expect(
      await prisma.academicContentEngagementEvent.count({
        where: { schoolId: schoolIds[0] },
      }),
    ).toBe(before);
  });
  it('preserves predecessor acknowledgement and allows a separate successor acknowledgement', async () => {
    await prisma.academicContentPublication.update({
      where: { id: first.pub.id },
      data: {
        status: 'CANCELLED',
        cancellationReason: 'REVISION_STARTED',
        cancelledAt: now,
        cancelledByUserId: authorId,
      },
    });
    const revision = await prisma.academicContentRevision.create({
      data: {
        schoolId: schoolIds[0],
        academicContentId: first.content.id,
        academicYearId: contexts[0].yearId,
        termId: contexts[0].termId,
        type: 'GENERAL_RESOURCE',
        audience: 'STUDENTS_AND_GUARDIANS',
        title: 'Successor',
        revisionNumber: 2,
        snapshotContractVersion: 2,
        sourceStatus: 'DRAFT',
        capturedByUserId: authorId,
      },
    });
    const successor = await prisma.academicContentPublication.create({
      data: {
        schoolId: schoolIds[0],
        academicContentId: first.content.id,
        revisionId: revision.id,
        clientRequestId: randomUUID(),
        requestFingerprint: 'c'.repeat(64),
        sourceContentStatus: 'DRAFT',
        status: 'PUBLISHED',
        publishAt: now,
        publishedAt: now,
        visibleFrom: now,
        createdByUserId: authorId,
        supersedesPublicationId: first.pub.id,
        changeSignificance: 'SIGNIFICANT',
      },
    });
    await prisma.academicContentRevisionTarget.create({
      data: {
        schoolId: schoolIds[0],
        revisionId: revision.id,
        scopeType: 'SCHOOL',
        identityFingerprint: 'd'.repeat(64),
      },
    });
    const link = await prisma.academicContentRevisionLink.create({
      data: {
        schoolId: schoolIds[0],
        revisionId: revision.id,
        label: first.link.label,
        url: first.link.url,
        sortOrder: 0,
      },
    });
    const reads = new AcademicContentRecipientReadRepository(prisma);
    const service = new AcademicContentCurrentAccessService(
      reads,
      new AcademicContentAudienceRepository(prisma),
    );
    const context = {
      schoolId: schoolIds[0],
      studentId: children[0].studentId,
      enrollmentId: children[0].enrollmentId,
      classroomId: contexts[0].classroomId,
      academicYearId: contexts[0].yearId,
      termId: contexts[0].termId,
    };
    const student = await service.getCurrentStudentContent(
      { ...context, actorKind: 'STUDENT', userId: children[0].userId },
      first.content.id,
    );
    const parent = await service.getCurrentParentContent(
      {
        ...context,
        actorKind: 'PARENT',
        userId: parentUserId,
        guardianIds: [contexts[0].guardianId],
      },
      first.content.id,
    );
    expect(student.links[0].revisionLinkId).toBe(link.id);
    expect(parent.links[0].revisionLinkId).toBe(link.id);
    expect(link.id).not.toBe(first.link.id);
    const ack = await prisma.academicContentAcknowledgement.create({
      data: {
        ...ackData(),
        publicationId: successor.id,
        revisionId: revision.id,
      },
    });
    expect(ack.acknowledgedAt).toBeInstanceOf(Date);
    expect(
      await prisma.academicContentAcknowledgement.count({
        where: {
          schoolId: schoolIds[0],
          studentId: children[0].studentId,
          actorUserId: parentUserId,
        },
      }),
    ).toBe(2);
    await rejected(
      prisma.academicContentPublication.delete({ where: { id: successor.id } }),
    );
    await rejected(
      prisma.guardian.delete({ where: { id: contexts[0].guardianId } }),
    );
    await prisma.studentGuardian.deleteMany({
      where: { schoolId: schoolIds[0], guardianId: contexts[0].guardianId },
    });
    expect(
      await prisma.academicContentAcknowledgement.findUnique({
        where: { id: ack.id },
      }),
    ).not.toBeNull();
  });
});

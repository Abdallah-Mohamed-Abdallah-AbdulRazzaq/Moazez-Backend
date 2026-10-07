import { randomBytes, randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentTargetScopeType as Scope,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentCurrentAccessService } from '../../src/modules/academics/academic-content/application/academic-content-current-access.service';
import { AcademicContentRecipientReadRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-recipient-read.repository';
import { AcademicContentAudienceRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-audience.repository';
import { AcademicContentCurrentRecipientContext } from '../../src/modules/academics/academic-content/domain/academic-content-current-access.policy';

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
describeDatabase('ACC-10A PostgreSQL current recipient authorization', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService({
    datasourceUrl:
      databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
  });
  const reads = new AcademicContentRecipientReadRepository(prisma);
  const service = new AcademicContentCurrentAccessService(
    reads,
    new AcademicContentAudienceRepository(prisma),
  );
  const now = new Date();
  let organizationId: string, schoolId: string, foreignSchoolId: string;
  let yearId: string, termId: string, otherYearId: string, otherTermId: string;
  let stageId: string,
    gradeId: string,
    otherGradeId: string,
    sectionId: string,
    classroomId: string,
    otherClassroomId: string,
    subjectId: string;
  const users: string[] = [],
    students: string[] = [],
    guardians: string[] = [];
  const enrollments: string[] = [];
  const context = (index = 0): AcademicContentCurrentRecipientContext => ({
    actorKind: 'STUDENT',
    schoolId,
    userId: users[index + 1],
    studentId: students[index],
    enrollmentId: enrollments[index],
    classroomId,
    academicYearId: yearId,
    termId,
  });
  const parent = (
    guardian = 0,
  ): Extract<
    AcademicContentCurrentRecipientContext,
    { actorKind: 'PARENT' }
  > => ({
    ...context(),
    actorKind: 'PARENT',
    userId: users[guardian + 3],
    guardianIds: [guardians[guardian]],
  });
  const deny = async (
    actor: AcademicContentCurrentRecipientContext,
    publicationId: string,
  ) => {
    await expect(
      service.assertPublicationAccess(actor, publicationId, now),
    ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
  };
  beforeAll(async () => {
    await prisma.$connect();
    const tag = randomUUID();
    organizationId = (
      await prisma.organization.create({
        data: { name: 'ACC10A', slug: `acc10a-${tag}` },
      })
    ).id;
    schoolId = (
      await prisma.school.create({
        data: { organizationId, name: 'ACC10A', slug: `acc10a-${tag}` },
      })
    ).id;
    foreignSchoolId = (
      await prisma.school.create({
        data: {
          organizationId,
          name: 'Foreign',
          slug: `acc10a-foreign-${tag}`,
        },
      })
    ).id;
    for (const userType of [
      UserType.SCHOOL_USER,
      UserType.STUDENT,
      UserType.STUDENT,
      UserType.PARENT,
      UserType.PARENT,
    ]) {
      users.push(
        (
          await prisma.user.create({
            data: {
              userType,
              email: `acc10a-${randomUUID()}@example.test`,
              firstName: 'Test',
              lastName: 'ACC',
            },
          })
        ).id,
      );
    }
    const year = async (name: string) =>
      prisma.academicYear.create({
        data: {
          schoolId,
          nameAr: name,
          nameEn: name,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2027-12-31'),
        },
      });
    yearId = (await year('Year')).id;
    otherYearId = (await year('Other Year')).id;
    const term = async (academicYearId: string) =>
      prisma.term.create({
        data: {
          schoolId,
          academicYearId,
          nameAr: 'Term',
          nameEn: 'Term',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2027-12-31'),
        },
      });
    termId = (await term(yearId)).id;
    otherTermId = (await term(otherYearId)).id;
    stageId = (
      await prisma.stage.create({
        data: { schoolId, nameAr: 'Stage', nameEn: 'Stage' },
      })
    ).id;
    gradeId = (
      await prisma.grade.create({
        data: { schoolId, stageId, nameAr: 'Grade', nameEn: 'Grade' },
      })
    ).id;
    otherGradeId = (
      await prisma.grade.create({
        data: {
          schoolId,
          stageId,
          nameAr: 'Other Grade',
          nameEn: 'Other Grade',
        },
      })
    ).id;
    sectionId = (
      await prisma.section.create({
        data: { schoolId, gradeId, nameAr: 'Section', nameEn: 'Section' },
      })
    ).id;
    classroomId = (
      await prisma.classroom.create({
        data: { schoolId, sectionId, nameAr: 'Classroom', nameEn: 'Classroom' },
      })
    ).id;
    otherClassroomId = (
      await prisma.classroom.create({
        data: {
          schoolId,
          sectionId,
          nameAr: 'Other Classroom',
          nameEn: 'Other Classroom',
        },
      })
    ).id;
    subjectId = (
      await prisma.subject.create({
        data: {
          schoolId,
          nameAr: 'Subject',
          nameEn: 'Subject',
          code: `acc10a-${tag}`,
        },
      })
    ).id;
    for (let i = 0; i < 2; i++) {
      students.push(
        (
          await prisma.student.create({
            data: {
              schoolId,
              organizationId,
              userId: users[i + 1],
              firstName: 'Student',
              lastName: String(i),
            },
          })
        ).id,
      );
      enrollments.push(
        (
          await prisma.enrollment.create({
            data: {
              schoolId,
              studentId: students[i],
              academicYearId: yearId,
              termId,
              classroomId,
              enrolledAt: now,
            },
          })
        ).id,
      );
      guardians.push(
        (
          await prisma.guardian.create({
            data: {
              schoolId,
              organizationId,
              userId: users[i + 3],
              firstName: 'Guardian',
              lastName: String(i),
              phone: '+201000000000',
              relation: 'parent',
            },
          })
        ).id,
      );
    }
  });
  beforeEach(async () => {
    await prisma.enrollment.updateMany({
      where: { schoolId },
      data: { status: 'ACTIVE', deletedAt: null, classroomId },
    });
    await prisma.student.updateMany({
      where: { schoolId },
      data: { status: 'ACTIVE', deletedAt: null },
    });
    await prisma.guardian.updateMany({
      where: { schoolId },
      data: { deletedAt: null, canReceiveNotifications: null },
    });
    await prisma.user.updateMany({
      where: { id: { in: users } },
      data: { status: 'ACTIVE', deletedAt: null },
    });
    await prisma.student.update({
      where: { id: students[0] },
      data: { userId: users[1] },
    });
    await prisma.studentGuardian.deleteMany({ where: { schoolId } });
    await prisma.studentGuardian.create({
      data: { schoolId, studentId: students[0], guardianId: guardians[0] },
    });
    await prisma.subjectAllocation.deleteMany({ where: { schoolId } });
  });
  afterAll(async () => {
    try {
      if (schoolId) {
        const where = { schoolId };
        await prisma.academicContentAudienceRecipientTarget.deleteMany({
          where,
        });
        await prisma.academicContentAudienceRecipient.deleteMany({ where });
        await prisma.academicContentPublication.deleteMany({ where });
        await prisma.academicContentRevisionTarget.deleteMany({ where });
        await prisma.academicContentRevision.deleteMany({ where });
        await prisma.academicContentTarget.deleteMany({ where });
        await prisma.academicContent.deleteMany({ where });
        await prisma.studentGuardian.deleteMany({ where });
        await prisma.enrollment.deleteMany({ where });
        await prisma.student.deleteMany({ where });
        await prisma.guardian.deleteMany({ where });
        await prisma.subjectAllocation.deleteMany({ where });
        await prisma.subject.deleteMany({ where });
        await prisma.classroom.deleteMany({ where });
        await prisma.section.deleteMany({ where });
        await prisma.grade.deleteMany({ where });
        await prisma.stage.deleteMany({ where });
        await prisma.term.deleteMany({ where });
        await prisma.academicYear.deleteMany({ where });
      }
      await prisma.school.deleteMany({
        where: { id: { in: [schoolId, foreignSchoolId].filter(Boolean) } },
      });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      if (organizationId)
        await prisma.organization.delete({ where: { id: organizationId } });
    } finally {
      await prisma.$disconnect();
    }
  });
  async function publication(
    scopeType: Scope = Scope.CLASSROOM,
    audience: Audience = Audience.STUDENTS_AND_GUARDIANS,
    qualified = false,
    options: {
      otherClassroomTarget?: boolean;
      nullHistoricalAccount?: boolean;
    } = {},
  ) {
    const content = await prisma.academicContent.create({
      data: {
        schoolId,
        academicYearId: yearId,
        termId,
        type: 'GENERAL_RESOURCE',
        audience,
        title: 'Authoring',
        createdByUserId: users[0],
      },
    });
    const revision = await prisma.academicContentRevision.create({
      data: {
        schoolId,
        academicContentId: content.id,
        revisionNumber: 1,
        snapshotContractVersion: 2,
        academicYearId: yearId,
        termId,
        type: 'GENERAL_RESOURCE',
        audience,
        title: 'Frozen',
        sourceStatus: 'DRAFT',
        capturedByUserId: users[0],
        typeSpecificSnapshot: {
          type: 'GENERAL_RESOURCE',
          state: { resourceCategory: null, notes: null },
        },
      },
    });
    const target = await prisma.academicContentRevisionTarget.create({
      data: {
        schoolId,
        revisionId: revision.id,
        scopeType,
        stageId: scopeType === Scope.STAGE ? stageId : null,
        gradeId: scopeType === Scope.GRADE ? gradeId : null,
        sectionId: scopeType === Scope.SECTION ? sectionId : null,
        classroomId: scopeType === Scope.CLASSROOM ? classroomId : null,
        subjectId: qualified ? subjectId : null,
        identityFingerprint: randomBytes(32).toString('hex'),
      },
    });
    if (options.otherClassroomTarget)
      await prisma.academicContentRevisionTarget.create({
        data: {
          schoolId,
          revisionId: revision.id,
          scopeType: 'CLASSROOM',
          classroomId: otherClassroomId,
          identityFingerprint: randomBytes(32).toString('hex'),
        },
      });
    const published = await prisma.academicContentPublication.create({
      data: {
        schoolId,
        academicContentId: content.id,
        revisionId: revision.id,
        status: 'PUBLISHED',
        sourceContentStatus: 'DRAFT',
        publishedAt: now,
        publishAt: now,
        visibleFrom: now,
        createdByUserId: users[0],
        clientRequestId: randomUUID(),
        requestFingerprint: randomBytes(32).toString('hex'),
      },
    });
    await prisma.academicContentAudienceRecipient.create({
      data: {
        schoolId,
        publicationId: published.id,
        revisionId: revision.id,
        recipientKind: audience === Audience.GUARDIANS ? 'GUARDIAN' : 'STUDENT',
        guardianId: audience === Audience.GUARDIANS ? guardians[0] : null,
        studentId: students[0],
        enrollmentId: enrollments[0],
        classroomId,
        recipientUserId: options.nullHistoricalAccount
          ? null
          : users[audience === Audience.GUARDIANS ? 3 : 1],
        identityFingerprint: randomBytes(32).toString('hex'),
      },
    });
    return { content, revision, target, published };
  }
  const snapshot = (publicationId: string) =>
    prisma.academicContentAudienceRecipient.findMany({
      where: { schoolId, publicationId },
      orderBy: { id: 'asc' },
    });
  it.each(Object.values(Scope))(
    'matches immutable %s scope against current hierarchy',
    async (scope) => {
      const p = await publication(scope);
      expect(
        (await service.assertPublicationAccess(context(), p.published.id, now))
          .matchedRevisionTargetIds,
      ).toEqual([p.target.id]);
    },
  );
  it.each([
    'matching',
    'zero',
    'missing',
    'grade',
    'year',
    'term',
    'deleted',
  ] as const)('enforces current SubjectAllocation: %s', async (variant) => {
    const p = await publication(Scope.CLASSROOM, Audience.STUDENTS, true);
    if (variant !== 'missing')
      await prisma.subjectAllocation.create({
        data: {
          schoolId,
          academicYearId: variant === 'year' ? otherYearId : yearId,
          termId: variant === 'term' ? otherTermId : termId,
          gradeId: variant === 'grade' ? otherGradeId : gradeId,
          subjectId,
          weeklyHours: variant === 'zero' ? 0 : 2,
          deletedAt: variant === 'deleted' ? now : null,
        },
      });
    if (variant === 'matching')
      await expect(
        service.assertPublicationAccess(context(), p.published.id, now),
      ).resolves.toBeDefined();
    else await deny(context(), p.published.id);
  });
  it('allows enrollment created after publication without altering historical recipients', async () => {
    const p = await publication();
    const before = await snapshot(p.published.id);
    await prisma.enrollment.delete({ where: { id: enrollments[1] } });
    enrollments[1] = (
      await prisma.enrollment.create({
        data: {
          schoolId,
          studentId: students[1],
          academicYearId: yearId,
          termId,
          classroomId,
          enrolledAt: new Date(now.getTime() + 1),
        },
      })
    ).id;
    await expect(
      service.assertPublicationAccess(context(1), p.published.id, now),
    ).resolves.toBeDefined();
    expect(await snapshot(p.published.id)).toEqual(before);
  });
  it('denies former Enrollment despite a historical recipient row', async () => {
    const p = await publication();
    const before = await snapshot(p.published.id);
    await prisma.enrollment.update({
      where: { id: enrollments[0] },
      data: { status: 'WITHDRAWN' },
    });
    await deny(context(), p.published.id);
    expect(await snapshot(p.published.id)).toEqual(before);
  });
  it('denies a classroom transfer unless another frozen target currently matches', async () => {
    const p = await publication();
    await prisma.enrollment.update({
      where: { id: enrollments[0] },
      data: { classroomId: otherClassroomId },
    });
    const transferred = { ...context(), classroomId: otherClassroomId };
    await deny(transferred, p.published.id);
    const matching = await publication(
      Scope.CLASSROOM,
      Audience.STUDENTS,
      false,
      { otherClassroomTarget: true },
    );
    await expect(
      service.assertPublicationAccess(transferred, matching.published.id, now),
    ).resolves.toBeDefined();
  });
  it('authorizes a later valid current account when historical user identity was null', async () => {
    const p = await publication(Scope.CLASSROOM, Audience.STUDENTS, false, {
      nullHistoricalAccount: true,
    });
    await prisma.student.update({
      where: { id: students[0] },
      data: { userId: null },
    });
    const before = await snapshot(p.published.id);
    await deny(context(), p.published.id);
    await prisma.student.update({
      where: { id: students[0] },
      data: { userId: users[1] },
    });
    await expect(
      service.assertPublicationAccess(context(), p.published.id, now),
    ).resolves.toBeDefined();
    expect(await snapshot(p.published.id)).toEqual(before);
  });
  it('allows late Guardian linkage and notification opt-out without snapshot membership', async () => {
    const p = await publication(Scope.CLASSROOM, Audience.GUARDIANS);
    const before = await snapshot(p.published.id);
    await deny(parent(1), p.published.id);
    await prisma.studentGuardian.create({
      data: { schoolId, studentId: students[0], guardianId: guardians[1] },
    });
    await prisma.guardian.update({
      where: { id: guardians[1] },
      data: { canReceiveNotifications: false },
    });
    await expect(
      service.assertPublicationAccess(parent(1), p.published.id, now),
    ).resolves.toBeDefined();
    expect(await snapshot(p.published.id)).toEqual(before);
  });
  it('denies a removed current Guardian relationship despite a historical Guardian recipient', async () => {
    const p = await publication(Scope.CLASSROOM, Audience.GUARDIANS);
    const before = await snapshot(p.published.id);
    await expect(
      service.assertPublicationAccess(parent(), p.published.id, now),
    ).resolves.toBeDefined();
    await prisma.studentGuardian.deleteMany({
      where: { schoolId, guardianId: guardians[0] },
    });
    await deny(parent(), p.published.id);
    expect(await snapshot(p.published.id)).toEqual(before);
  });
  it('uses exact published Revision Targets after mutable authoring targets diverge', async () => {
    const p = await publication();
    await prisma.academicContentTarget.create({
      data: {
        schoolId,
        academicContentId: p.content.id,
        scopeType: 'CLASSROOM',
        classroomId: otherClassroomId,
        createdByUserId: users[0],
        identityFingerprint: randomBytes(32).toString('hex'),
      },
    });
    const other = await prisma.academicContentRevision.create({
      data: {
        schoolId,
        academicContentId: p.content.id,
        revisionNumber: 2,
        snapshotContractVersion: 2,
        academicYearId: yearId,
        termId,
        type: 'GENERAL_RESOURCE',
        audience: Audience.INTERNAL_STAFF,
        title: 'Unpublished revision',
        sourceStatus: 'DRAFT',
        capturedByUserId: users[0],
      },
    });
    const result = await service.assertPublicationAccess(
      context(),
      p.published.id,
      now,
    );
    expect(result.publication.revisionId).toBe(p.revision.id);
    expect(result.publication.revisionId).not.toBe(other.id);
    expect(result.matchedRevisionTargetIds).toEqual([p.target.id]);
  });
  it.each([
    'student-inactive',
    'student-deleted',
    'enrollment-deleted',
    'guardian-deleted',
    'user-inactive',
    'wrong-user',
    'wrong-guardian',
    'wrong-school',
    'wrong-enrollment',
    'wrong-year',
    'wrong-term',
  ] as const)('fails closed on %s', async (variant) => {
    const p = await publication();
    let actor = context();
    if (variant === 'student-inactive')
      await prisma.student.update({
        where: { id: students[0] },
        data: { status: 'SUSPENDED' },
      });
    if (variant === 'student-deleted')
      await prisma.student.update({
        where: { id: students[0] },
        data: { deletedAt: now },
      });
    if (variant === 'enrollment-deleted')
      await prisma.enrollment.update({
        where: { id: enrollments[0] },
        data: { deletedAt: now },
      });
    if (variant === 'guardian-deleted') {
      actor = parent();
      await prisma.guardian.update({
        where: { id: guardians[0] },
        data: { deletedAt: now },
      });
    }
    if (variant === 'user-inactive')
      await prisma.user.update({
        where: { id: users[1] },
        data: { status: 'DISABLED' },
      });
    if (variant === 'wrong-user') actor = { ...actor, userId: users[2] };
    if (variant === 'wrong-guardian')
      actor = { ...parent(), guardianIds: [guardians[1]] };
    if (variant === 'wrong-school')
      actor = { ...actor, schoolId: foreignSchoolId };
    if (variant === 'wrong-enrollment')
      actor = { ...actor, enrollmentId: enrollments[1] };
    if (variant === 'wrong-year')
      actor = { ...actor, academicYearId: otherYearId };
    if (variant === 'wrong-term') actor = { ...actor, termId: otherTermId };
    await deny(actor, p.published.id);
  });
  it('never queries historical audience as the access ACL', async () => {
    const p = await publication();
    const spy = jest.spyOn(prisma.academicContentAudienceRecipient, 'findMany');
    try {
      await service.assertPublicationAccess(context(1), p.published.id, now);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

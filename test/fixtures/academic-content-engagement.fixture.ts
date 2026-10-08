import { randomUUID } from 'node:crypto';
import { AcademicContentType, UserType } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentCurrentRecipientContext } from '../../src/modules/academics/academic-content/domain/academic-content-current-access.policy';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setActiveMembership,
} from '../../src/common/context/request-context';

export class AcademicContentEngagementFixture {
  readonly authorId = randomUUID();
  readonly parentId = randomUUID();
  readonly guardianIds = [randomUUID(), randomUUID()].sort();
  readonly schools = [0, 1, 2].map(() => ({
    schoolId: randomUUID(),
    organizationId: randomUUID(),
    yearId: randomUUID(),
    termId: randomUUID(),
    stageId: randomUUID(),
    gradeId: randomUUID(),
    sectionId: randomUUID(),
    classroomId: randomUUID(),
    subjectId: randomUUID(),
  }));
  readonly children = [0, 0, 1, 2].map((school) => ({
    school,
    userId: randomUUID(),
    studentId: randomUUID(),
    enrollmentId: randomUUID(),
    membershipId: randomUUID(),
    roleId: randomUUID(),
  }));
  readonly parentMembershipId = randomUUID();
  readonly parentRoleId = randomUUID();
  readonly permissionId = randomUUID();
  readonly foreignParentId = randomUUID();
  readonly foreignGuardianId = randomUUID();
  readonly users = [
    this.authorId,
    this.parentId,
    this.foreignParentId,
    ...this.children.map((c) => c.userId),
  ];
  get school() {
    return this.schools[0];
  }
  constructor(readonly prisma: PrismaService) {}

  context(
    kind: 'STUDENT' | 'PARENT' = 'STUDENT',
    childIndex = 0,
  ): AcademicContentCurrentRecipientContext {
    const child = this.children[childIndex];
    const school = this.schools[child.school];
    const common = {
      schoolId: school.schoolId,
      studentId: child.studentId,
      enrollmentId: child.enrollmentId,
      classroomId: school.classroomId,
      academicYearId: school.yearId,
      termId: school.termId,
    };
    return kind === 'STUDENT'
      ? { ...common, actorKind: kind, userId: child.userId }
      : {
          ...common,
          actorKind: kind,
          userId: this.parentId,
          guardianIds: this.guardianIds,
        };
  }
  membership(kind: 'STUDENT' | 'PARENT', child = 0) {
    return kind === 'STUDENT'
      ? this.children[child].membershipId
      : this.parentMembershipId;
  }
  asActor<T>(
    kind: 'STUDENT' | 'PARENT',
    work: () => Promise<T>,
    child = 0,
  ): Promise<T> {
    const context = this.context(kind, child),
      school = this.schools[this.children[child].school];
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: context.userId, userType: kind });
      setActiveMembership({
        membershipId: this.membership(kind, child),
        schoolId: context.schoolId,
        organizationId: school.organizationId,
        roleId:
          kind === 'STUDENT' ? this.children[child].roleId : this.parentRoleId,
        permissions: ['academics.academic_content.view'],
      });
      return work();
    });
  }

  async create() {
    for (const school of this.schools) {
      await this.prisma.organization.create({
        data: {
          id: school.organizationId,
          name: 'ACC11B fixture',
          slug: `acc11b-${school.organizationId}`,
        },
      });
      await this.prisma.school.create({
        data: {
          id: school.schoolId,
          organizationId: school.organizationId,
          name: 'ACC11B',
          slug: `acc11b-${school.schoolId}`,
        },
      });
      const dates = {
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 86400000),
      };
      await this.prisma.academicYear.create({
        data: {
          id: school.yearId,
          schoolId: school.schoolId,
          nameAr: 'Year',
          nameEn: 'Year',
          ...dates,
        },
      });
      await this.prisma.term.create({
        data: {
          id: school.termId,
          schoolId: school.schoolId,
          academicYearId: school.yearId,
          nameAr: 'Term',
          nameEn: 'Term',
          isActive: true,
          ...dates,
        },
      });
      await this.prisma.stage.create({
        data: {
          id: school.stageId,
          schoolId: school.schoolId,
          nameAr: 'Stage',
          nameEn: 'Stage',
        },
      });
      await this.prisma.grade.create({
        data: {
          id: school.gradeId,
          schoolId: school.schoolId,
          stageId: school.stageId,
          nameAr: 'Grade',
          nameEn: 'Grade',
        },
      });
      await this.prisma.section.create({
        data: {
          id: school.sectionId,
          schoolId: school.schoolId,
          gradeId: school.gradeId,
          nameAr: 'Section',
          nameEn: 'Section',
        },
      });
      await this.prisma.classroom.create({
        data: {
          id: school.classroomId,
          schoolId: school.schoolId,
          sectionId: school.sectionId,
          nameAr: 'Classroom',
          nameEn: 'Classroom',
        },
      });
      await this.prisma.subject.create({
        data: {
          id: school.subjectId,
          schoolId: school.schoolId,
          code: 'fixture',
          nameAr: 'Subject',
          nameEn: 'Subject',
        },
      });
      await this.prisma.subjectAllocation.create({
        data: {
          schoolId: school.schoolId,
          academicYearId: school.yearId,
          termId: school.termId,
          gradeId: school.gradeId,
          subjectId: school.subjectId,
          weeklyHours: 2,
        },
      });
    }
    await this.prisma.user.createMany({
      data: this.users.map((id) => ({
        id,
        userType:
          id === this.authorId
            ? UserType.SCHOOL_USER
            : this.children.some((c) => c.userId === id)
              ? UserType.STUDENT
              : UserType.PARENT,
        email: `${id}@acc11b.test`,
        firstName: 'Fixture',
        lastName: 'Private',
      })),
    });
    const permission = await this.prisma.permission.upsert({
      where: { code: 'academics.academic_content.view' },
      create: {
        id: this.permissionId,
        code: 'academics.academic_content.view',
        module: 'academics',
        resource: 'academic_content',
        action: 'view',
      },
      update: {},
    });
    for (const child of this.children) {
      const school = this.schools[child.school];
      await this.prisma.student.create({
        data: {
          id: child.studentId,
          schoolId: school.schoolId,
          organizationId: school.organizationId,
          userId: child.userId,
          firstName: 'Child',
          lastName: 'Private',
        },
      });
      await this.prisma.enrollment.create({
        data: {
          id: child.enrollmentId,
          schoolId: school.schoolId,
          studentId: child.studentId,
          academicYearId: school.yearId,
          termId: school.termId,
          classroomId: school.classroomId,
          enrolledAt: new Date(),
        },
      });
      await this.addMembership(
        child.membershipId,
        child.roleId,
        child.userId,
        UserType.STUDENT,
        school,
        permission.id,
      );
    }
    await this.addMembership(
      this.parentMembershipId,
      this.parentRoleId,
      this.parentId,
      UserType.PARENT,
      this.school,
      permission.id,
    );
    for (const id of this.guardianIds) {
      await this.prisma.guardian.create({
        data: {
          id,
          schoolId: this.school.schoolId,
          organizationId: this.school.organizationId,
          userId: this.parentId,
          firstName: 'Parent',
          lastName: 'Private',
          phone: 'private-fixture',
          relation: 'parent',
        },
      });
      await this.prisma.studentGuardian.createMany({
        data: this.children.slice(0, 2).map((child) => ({
          schoolId: this.school.schoolId,
          studentId: child.studentId,
          guardianId: id,
        })),
      });
    }
    await this.prisma.guardian.create({
      data: {
        id: this.foreignGuardianId,
        schoolId: this.schools[1].schoolId,
        organizationId: this.schools[1].organizationId,
        userId: this.foreignParentId,
        firstName: 'Foreign',
        lastName: 'Private',
        phone: 'private-fixture',
        relation: 'parent',
      },
    });
  }

  private async addMembership(
    id: string,
    roleId: string,
    userId: string,
    userType: UserType,
    school: (typeof this.schools)[number],
    permissionId: string,
  ) {
    await this.prisma.role.create({
      data: {
        id: roleId,
        schoolId: school.schoolId,
        key: `acc11b-${roleId}`,
        name: 'Fixture',
        rolePermissions: { create: { permissionId } },
      },
    });
    await this.prisma.membership.create({
      data: {
        id,
        userId,
        userType,
        roleId,
        schoolId: school.schoolId,
        organizationId: school.organizationId,
      },
    });
  }

  async publication(
    type: AcademicContentType = 'GENERAL_RESOURCE',
    index = 0,
    audience:
      | 'STUDENTS'
      | 'GUARDIANS'
      | 'STUDENTS_AND_GUARDIANS'
      | 'INTERNAL_STAFF' = 'STUDENTS_AND_GUARDIANS',
    subject = false,
  ) {
    const school = this.schools[index],
      now = new Date(Date.now() - 5000);
    const content = await this.prisma.academicContent.create({
      data: {
        schoolId: school.schoolId,
        academicYearId: school.yearId,
        termId: school.termId,
        type,
        audience,
        title: 'Fixture publication',
        createdByUserId: this.authorId,
      },
    });
    const snapshot =
      type === 'ONLINE_SESSION'
        ? {
            type,
            state: {
              platform: 'ZOOM',
              providerName: null,
              startAt: new Date(Date.now() - 60000).toISOString(),
              endAt: new Date(Date.now() + 3600000).toISOString(),
              joinUrl: 'https://example.test/private-join',
              accessCode: null,
              instructions: null,
              timezone: 'Africa/Cairo',
              timetableEntryId: null,
            },
          }
        : undefined;
    const revision = await this.prisma.academicContentRevision.create({
      data: {
        schoolId: school.schoolId,
        academicContentId: content.id,
        academicYearId: school.yearId,
        termId: school.termId,
        type,
        audience,
        title: content.title,
        revisionNumber: 1,
        snapshotContractVersion: 2,
        sourceStatus: 'DRAFT',
        capturedByUserId: this.authorId,
        typeSpecificSnapshot: snapshot,
        targets: {
          create: {
            scopeType: 'SCHOOL',
            subjectId: subject ? school.subjectId : null,
            identityFingerprint: 'b'.repeat(64),
          },
        },
      },
    });
    const publication = await this.prisma.academicContentPublication.create({
      data: {
        schoolId: school.schoolId,
        academicContentId: content.id,
        revisionId: revision.id,
        clientRequestId: randomUUID(),
        requestFingerprint: 'b'.repeat(64),
        sourceContentStatus: 'DRAFT',
        status: 'PUBLISHED',
        publishAt: now,
        publishedAt: now,
        visibleFrom: now,
        createdByUserId: this.authorId,
      },
    });
    const link = await this.prisma.academicContentRevisionLink.create({
      data: {
        schoolId: school.schoolId,
        revisionId: revision.id,
        label: 'Fixture link',
        url: 'https://example.test/private-link',
        sortOrder: 0,
      },
    });
    const file = await this.prisma.file.create({
      data: {
        schoolId: school.schoolId,
        organizationId: school.organizationId,
        bucket: 'private-fixture',
        objectKey: randomUUID(),
        originalName: 'private.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12,
        visibility: 'PRIVATE',
      },
    });
    await this.prisma.academicContentRevisionAsset.create({
      data: {
        schoolId: school.schoolId,
        revisionId: revision.id,
        fileId: file.id,
        sortOrder: 0,
      },
    });
    return { content, revision, publication, link, file };
  }

  async resetAdmission() {
    await this.prisma.academicContentEngagementAdmission.deleteMany({
      where: { schoolId: { in: this.schools.map((s) => s.schoolId) } },
    });
  }

  async dispose() {
    const schoolIds = this.schools.map((s) => s.schoolId),
      where = { schoolId: { in: schoolIds } };
    await this.prisma.academicContentEngagementEvent.deleteMany({ where });
    await this.resetAdmission();
    await this.prisma.academicContentRevisionAsset.deleteMany({ where });
    await this.prisma.academicContentRevisionLink.deleteMany({ where });
    await this.prisma.academicContentPublication.deleteMany({
      where: { ...where, supersedesPublicationId: { not: null } },
    });
    await this.prisma.academicContentPublication.deleteMany({ where });
    await this.prisma.academicContentRevisionTarget.deleteMany({ where });
    await this.prisma.academicContentRevision.deleteMany({ where });
    await this.prisma.academicContent.deleteMany({ where });
    await this.prisma.academicContentFilePolicy.deleteMany({ where });
    await this.prisma.file.deleteMany({ where });
    await this.prisma.membership.deleteMany({ where });
    await this.prisma.role.deleteMany({ where });
    await this.prisma.studentGuardian.deleteMany({ where });
    await this.prisma.guardian.deleteMany({ where });
    await this.prisma.enrollment.deleteMany({ where });
    await this.prisma.student.deleteMany({ where });
    await this.prisma.subjectAllocation.deleteMany({ where });
    await this.prisma.subject.deleteMany({ where });
    await this.prisma.classroom.deleteMany({ where });
    await this.prisma.section.deleteMany({ where });
    await this.prisma.grade.deleteMany({ where });
    await this.prisma.stage.deleteMany({ where });
    await this.prisma.term.deleteMany({ where });
    await this.prisma.academicYear.deleteMany({ where });
    await this.prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
    await this.prisma.user.deleteMany({ where: { id: { in: this.users } } });
    await this.prisma.organization.deleteMany({
      where: { id: { in: this.schools.map((s) => s.organizationId) } },
    });
    await this.prisma.permission.deleteMany({
      where: { id: this.permissionId },
    });
  }
}

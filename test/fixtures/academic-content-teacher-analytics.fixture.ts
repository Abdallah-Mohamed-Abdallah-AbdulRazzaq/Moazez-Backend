import { randomUUID } from 'node:crypto';
import {
  AcademicContentEngagementActorKind,
  AcademicContentEngagementEventType,
  Prisma,
} from '@prisma/client';
import { AcademicContentAcknowledgementFixture } from './academic-content-acknowledgement.fixture';
import { ACADEMIC_CONTENT_OWN_ANALYTICS_PERMISSIONS } from '../../src/modules/academics/academic-content/domain/academic-content-analytics.contract';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setActiveMembership,
} from '../../src/common/context/request-context';

export class AcademicContentTeacherAnalyticsFixture extends AcademicContentAcknowledgementFixture {
  readonly teacherRoleId = randomUUID();
  readonly teacherMembershipId = randomUUID();
  readonly otherTeacherId = randomUUID();
  readonly allocationIds = [randomUUID(), randomUUID()];
  readonly secondClassroomId = randomUUID();
  readonly foreignAllocationId = randomUUID();
  readonly foreignClassroomId = randomUUID();
  get scope() {
    return {
      schoolId: this.school.schoolId,
      organizationId: this.school.organizationId,
      teacherUserId: this.authorId,
      membershipId: this.teacherMembershipId,
    };
  }
  asTeacher<T>(work: () => Promise<T>) {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: this.authorId, userType: 'TEACHER' });
      setActiveMembership({
        ...this.scope,
        membershipId: this.teacherMembershipId,
        roleId: this.teacherRoleId,
        permissions: [...ACADEMIC_CONTENT_OWN_ANALYTICS_PERMISSIONS],
      });
      return work();
    });
  }
  async create() {
    await super.create();
    await this.prisma.user.update({
      where: { id: this.authorId },
      data: { userType: 'TEACHER' },
    });
    this.users.push(this.otherTeacherId);
    await this.prisma.user.create({
      data: {
        id: this.otherTeacherId,
        userType: 'TEACHER',
        email: `${this.otherTeacherId}@acc11d.test`,
        firstName: 'Other',
        lastName: 'Teacher',
      },
    });
    const grants: { permissionId: string }[] = [];
    for (const code of ACADEMIC_CONTENT_OWN_ANALYTICS_PERMISSIONS) {
      const permission = await this.prisma.permission.upsert({
        where: { code },
        update: {},
        create: {
          code,
          module: 'academics',
          resource: code.endsWith('own.view')
            ? 'academic_content.analytics.own'
            : 'academic_content',
          action: 'view',
        },
      });
      grants.push({ permissionId: permission.id });
    }
    await this.prisma.role.create({
      data: {
        id: this.teacherRoleId,
        schoolId: this.school.schoolId,
        key: `acc11d-${this.teacherRoleId}`,
        name: 'Analytics Teacher',
        rolePermissions: { create: grants },
      },
    });
    await this.prisma.membership.create({
      data: {
        id: this.teacherMembershipId,
        schoolId: this.school.schoolId,
        organizationId: this.school.organizationId,
        roleId: this.teacherRoleId,
        userId: this.authorId,
        userType: 'TEACHER',
      },
    });
    for (const id of [this.secondClassroomId, this.foreignClassroomId])
      await this.prisma.classroom.create({
        data: {
          id,
          schoolId: this.school.schoolId,
          sectionId: this.school.sectionId,
          nameAr: `Class ${id}`,
          nameEn: `Class ${id}`,
        },
      });
    await this.prisma.teacherSubjectAllocation.createMany({
      data: [
        ...this.allocationIds.map((id, index) => ({
          id,
          schoolId: this.school.schoolId,
          teacherUserId: this.authorId,
          termId: this.school.termId,
          subjectId: this.school.subjectId,
          classroomId:
            index === 0 ? this.school.classroomId : this.secondClassroomId,
        })),
        {
          id: this.foreignAllocationId,
          schoolId: this.school.schoolId,
          teacherUserId: this.otherTeacherId,
          termId: this.school.termId,
          subjectId: this.school.subjectId,
          classroomId: this.foreignClassroomId,
        },
      ],
    });
  }
  targets(ids = this.allocationIds) {
    return ids.map((id, index) => ({
      schoolId: this.school.schoolId,
      scopeType: 'CLASSROOM' as const,
      classroomId:
        id === this.foreignAllocationId
          ? this.foreignClassroomId
          : id === this.allocationIds[0]
            ? this.school.classroomId
            : this.secondClassroomId,
      subjectId: this.school.subjectId,
      teacherSubjectAllocationId: id,
      identityFingerprint: index.toString(16).padStart(64, '0'),
    }));
  }
  async ownedSource(
    type: 'ONLINE_SESSION' | 'GUARDIAN_WEEKLY_NOTE' = 'ONLINE_SESSION',
  ) {
    const source =
      type === 'GUARDIAN_WEEKLY_NOTE'
        ? await this.note()
        : await this.publication(type);
    await this.prisma.academicContentTarget.createMany({
      data: this.targets().map((target) => ({
        ...target,
        academicContentId: source.content.id,
        createdByUserId: this.authorId,
      })),
    });
    await this.prisma.academicContentRevisionTarget.deleteMany({
      where: { revisionId: source.revision.id },
    });
    await this.prisma.academicContentRevisionTarget.createMany({
      data: this.targets().map((target) => ({
        ...target,
        revisionId: source.revision.id,
      })),
    });
    return source;
  }
  async successor(source: AnalyticsSource, targetIds = this.allocationIds) {
    const [{ at }] = await this.prisma.$queryRaw<
      { at: Date }[]
    >`SELECT clock_timestamp() AS at`;
    const visibleAt = new Date(at.getTime() - 5_000);
    await this.prisma.academicContentPublication.updateMany({
      where: { id: source.publication.id, status: 'PUBLISHED' },
      data: { status: 'EXPIRED', expiredAt: new Date() },
    });
    const revision = await this.prisma.academicContentRevision.create({
      data: {
        schoolId: this.school.schoolId,
        academicContentId: source.content.id,
        academicYearId: this.school.yearId,
        termId: this.school.termId,
        type: source.revision.type,
        audience: source.revision.audience,
        title: 'Successor',
        revisionNumber: source.revision.revisionNumber + 1,
        snapshotContractVersion: 2,
        sourceStatus: 'DRAFT',
        capturedByUserId: this.authorId,
        typeSpecificSnapshot: source.revision
          .typeSpecificSnapshot as Prisma.InputJsonValue,
        targets: {
          create: this.targets(targetIds).map((target) => ({
            scopeType: target.scopeType,
            classroomId: target.classroomId,
            subjectId: target.subjectId,
            teacherSubjectAllocationId: target.teacherSubjectAllocationId,
            identityFingerprint: target.identityFingerprint,
          })),
        },
      },
    });
    const publication = await this.prisma.academicContentPublication.create({
      data: {
        schoolId: this.school.schoolId,
        academicContentId: source.content.id,
        revisionId: revision.id,
        clientRequestId: randomUUID(),
        requestFingerprint: 'c'.repeat(64),
        sourceContentStatus: 'DRAFT',
        status: 'PUBLISHED',
        publishAt: visibleAt,
        publishedAt: visibleAt,
        visibleFrom: visibleAt,
        createdByUserId: this.authorId,
        supersedesPublicationId: source.publication.id,
        changeSignificance: 'SIGNIFICANT',
      },
    });
    return { ...source, revision, publication };
  }
  event(
    source: AnalyticsSource,
    type: AcademicContentEngagementEventType = 'CONTENT_VIEWED',
    kind: AcademicContentEngagementActorKind = 'STUDENT',
    child = 0,
    otherParent = false,
    at?: Date,
    guardian = 0,
  ) {
    return this.prisma.academicContentEngagementEvent.create({
      data: {
        schoolId: this.school.schoolId,
        academicContentId: source.content.id,
        publicationId: source.publication.id,
        revisionId: source.revision.id,
        actorKind: kind,
        actorUserId:
          kind === 'STUDENT'
            ? this.children[child].userId
            : otherParent
              ? this.foreignParentId
              : this.parentId,
        studentId: this.children[child].studentId,
        enrollmentId: this.children[child].enrollmentId,
        guardianId:
          kind === 'STUDENT'
            ? null
            : otherParent
              ? this.otherGuardianId
              : this.guardianIds[guardian],
        eventType: type,
        fileId:
          type === 'FILE_PREVIEWED' || type === 'FILE_DOWNLOADED'
            ? source.file.id
            : null,
        revisionLinkId: type === 'LINK_CLICKED' ? source.link.id : null,
        clientRequestId: randomUUID(),
        requestFingerprint: 'd'.repeat(64),
        createdAt: at,
      },
    });
  }
  ack(
    source: AnalyticsSource,
    child = 0,
    other = false,
    at?: Date,
    guardian = 0,
  ) {
    return this.prisma.academicContentAcknowledgement.create({
      data: {
        schoolId: this.school.schoolId,
        academicContentId: source.content.id,
        publicationId: source.publication.id,
        revisionId: source.revision.id,
        studentId: this.children[child].studentId,
        enrollmentId: this.children[child].enrollmentId,
        actorUserId: other ? this.foreignParentId : this.parentId,
        guardianId: other ? this.otherGuardianId : this.guardianIds[guardian],
        acknowledgedAt: at,
      },
    });
  }
  async dispose() {
    const where = {
      schoolId: { in: this.schools.map((school) => school.schoolId) },
    };
    await this.prisma.academicContentTarget.deleteMany({ where });
    await this.prisma.teacherSubjectAllocation.deleteMany({ where });
    await super.dispose();
  }
}
export type AnalyticsSource = Awaited<
  ReturnType<AcademicContentTeacherAnalyticsFixture['ownedSource']>
>;

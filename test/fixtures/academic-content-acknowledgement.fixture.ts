import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setActiveMembership,
} from '../../src/common/context/request-context';
import { AcademicContentAcknowledgementRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-acknowledgement.repository';
import { AcademicContentAcknowledgementService } from '../../src/modules/academics/academic-content/application/academic-content-acknowledgement.service';
import { AcademicContentEngagementFixture } from './academic-content-engagement.fixture';

export class AcademicContentAcknowledgementFixture extends AcademicContentEngagementFixture {
  readonly otherMembershipId = randomUUID();
  readonly otherGuardianId = randomUUID();
  async create() {
    await super.create();
    await this.prisma.membership.create({
      data: {
        id: this.otherMembershipId,
        userId: this.foreignParentId,
        userType: 'PARENT',
        roleId: this.parentRoleId,
        schoolId: this.school.schoolId,
        organizationId: this.school.organizationId,
      },
    });
    await this.prisma.guardian.create({
      data: {
        id: this.otherGuardianId,
        schoolId: this.school.schoolId,
        organizationId: this.school.organizationId,
        userId: this.foreignParentId,
        firstName: 'Other',
        lastName: 'Parent',
        phone: 'private-fixture',
        relation: 'parent',
      },
    });
    await this.prisma.studentGuardian.create({
      data: {
        schoolId: this.school.schoolId,
        studentId: this.children[0].studentId,
        guardianId: this.otherGuardianId,
      },
    });
  }
  async note(required = true, school = 0, subject = false) {
    const source = await this.publication(
      'GUARDIAN_WEEKLY_NOTE',
      school,
      'GUARDIANS',
      subject,
    );
    const revision = await this.prisma.academicContentRevision.update({
      where: { id: source.revision.id },
      data: {
        typeSpecificSnapshot: {
          type: 'GUARDIAN_WEEKLY_NOTE',
          state: {
            body: 'Private weekly note',
            priority: 'NORMAL',
            requiresAcknowledgement: required,
          },
        },
      },
    });
    return { ...source, revision };
  }
  parentContext(child = 0, other = false) {
    const context = this.context('PARENT', child);
    if (context.actorKind !== 'PARENT')
      throw new Error('Parent fixture context required');
    return {
      ...context,
      ...(other
        ? { userId: this.foreignParentId, guardianIds: [this.otherGuardianId] }
        : {}),
    };
  }
  asParent<T>(work: () => Promise<T>, other = false) {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({
        id: other ? this.foreignParentId : this.parentId,
        userType: 'PARENT',
      });
      setActiveMembership({
        membershipId: other ? this.otherMembershipId : this.parentMembershipId,
        schoolId: this.school.schoolId,
        organizationId: this.school.organizationId,
        roleId: this.parentRoleId,
        permissions: ['academics.academic_content.view'],
      });
      return work();
    });
  }
  acknowledge(
    source: Awaited<ReturnType<AcademicContentAcknowledgementFixture['note']>>,
    write = true,
    child = 0,
    other = false,
  ) {
    const service = new AcademicContentAcknowledgementService(
      new AcademicContentAcknowledgementRepository(this.prisma),
    );
    return this.asParent(
      () =>
        service.resolve(
          this.parentContext(child, other),
          source.content.id,
          source.publication.id,
          write,
        ),
      other,
    );
  }
  async revoke(
    tx: Prisma.TransactionClient,
    kind: AcknowledgementRevocation,
    source: Awaited<ReturnType<AcademicContentAcknowledgementFixture['note']>>,
  ) {
    const schoolId = this.school.schoolId,
      child = this.children[0];
    switch (kind) {
      case 'GuardianLink':
        return tx.studentGuardian.deleteMany({
          where: {
            schoolId,
            studentId: child.studentId,
            guardianId: { in: this.guardianIds },
          },
        });
      case 'GuardianAccount':
        return tx.guardian.updateMany({
          where: { schoolId, id: { in: this.guardianIds } },
          data: { userId: this.foreignParentId },
        });
      case 'GuardianDeleted':
        return tx.guardian.updateMany({
          where: { schoolId, id: { in: this.guardianIds } },
          data: { deletedAt: new Date() },
        });
      case 'Actor':
        return tx.user.update({
          where: { id: this.parentId },
          data: { status: 'DISABLED' },
        });
      case 'Membership':
        return tx.membership.update({
          where: { id: this.parentMembershipId },
          data: { status: 'INACTIVE', endedAt: new Date() },
        });
      case 'Permission':
        return tx.rolePermission.deleteMany({
          where: { roleId: this.parentRoleId },
        });
      case 'Student':
        return tx.student.update({
          where: { id: child.studentId },
          data: { status: 'SUSPENDED' },
        });
      case 'Enrollment':
        return tx.enrollment.update({
          where: { id: child.enrollmentId },
          data: { deletedAt: new Date() },
        });
      case 'EnrollmentInactive':
        return tx.enrollment.update({
          where: { id: child.enrollmentId },
          data: { status: 'WITHDRAWN' },
        });
      case 'Term':
        return tx.enrollment.update({
          where: { id: child.enrollmentId },
          data: { termId: null },
        });
      case 'Classroom':
        return tx.classroom.update({
          where: { id: this.school.classroomId },
          data: { deletedAt: new Date() },
        });
      case 'SubjectAllocation':
        return tx.subjectAllocation.updateMany({
          where: { schoolId, termId: this.school.termId },
          data: { weeklyHours: 0 },
        });
      case 'School':
        return tx.school.update({
          where: { id: schoolId },
          data: { status: 'SUSPENDED' },
        });
      case 'Organization':
        return tx.organization.update({
          where: { id: this.school.organizationId },
          data: { status: 'SUSPENDED' },
        });
      case 'Cancellation':
      case 'Supersession': {
        await tx.$queryRaw`SELECT id FROM academic_contents WHERE school_id = ${schoolId}::uuid AND id = ${source.content.id}::uuid FOR UPDATE`;
        await tx.academicContentPublication.update({
          where: { id: source.publication.id },
          data:
            kind === 'Cancellation'
              ? {
                  status: 'CANCELLED',
                  cancelledAt: new Date(),
                  cancellationReason: 'WITHDRAWN',
                }
              : { status: 'EXPIRED', expiredAt: new Date() },
        });
        if (kind === 'Supersession') {
          const revision = await tx.academicContentRevision.create({
            data: {
              schoolId,
              academicContentId: source.content.id,
              revisionNumber: 2,
              snapshotContractVersion: 2,
              academicYearId: this.school.yearId,
              termId: this.school.termId,
              type: 'GUARDIAN_WEEKLY_NOTE',
              audience: 'GUARDIANS',
              title: 'Successor',
              sourceStatus: 'DRAFT',
              capturedByUserId: this.authorId,
              typeSpecificSnapshot: source.revision
                .typeSpecificSnapshot as Prisma.InputJsonValue,
              targets: {
                create: {
                  scopeType: 'SCHOOL',
                  identityFingerprint: 'c'.repeat(64),
                },
              },
            },
          });
          const now = new Date();
          await tx.academicContentPublication.create({
            data: {
              schoolId,
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
              createdByUserId: this.authorId,
            },
          });
        }
      }
    }
  }
  async dispose() {
    await this.prisma.academicContentAcknowledgement.deleteMany({
      where: {
        schoolId: { in: this.schools.map((school) => school.schoolId) },
      },
    });
    await super.dispose();
  }
}

export const ACKNOWLEDGEMENT_REVOCATIONS = [
  'GuardianLink',
  'GuardianAccount',
  'GuardianDeleted',
  'Actor',
  'Membership',
  'Permission',
  'Student',
  'Enrollment',
  'EnrollmentInactive',
  'Term',
  'Classroom',
  'SubjectAllocation',
  'School',
  'Organization',
  'Cancellation',
  'Supersession',
] as const;
export type AcknowledgementRevocation =
  (typeof ACKNOWLEDGEMENT_REVOCATIONS)[number];

import { Injectable } from '@nestjs/common';
import {
  AcademicContentApprovalStatus as Status,
  AcademicContentType,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { CommunicationAcademicContentReviewDecisionJobData } from '../../../communication/domain/communication-notification-generation-domain';

const SOURCE_SELECT = {
  id: true,
  schoolId: true,
  academicContentId: true,
  revisionId: true,
  roundNumber: true,
  status: true,
  submittedByUserId: true,
  submittedAt: true,
  decidedByUserId: true,
  decidedAt: true,
  academicContent: {
    select: { id: true, schoolId: true, type: true, deletedAt: true },
  },
  revision: {
    select: {
      id: true,
      schoolId: true,
      academicContentId: true,
      snapshotContractVersion: true,
      type: true,
      title: true,
    },
  },
  school: { select: { organizationId: true } },
  decidedBy: {
    select: { id: true, userType: true, status: true, deletedAt: true },
  },
} satisfies Prisma.AcademicContentApprovalSelect;

export type AcademicContentReviewDecisionSource =
  Prisma.AcademicContentApprovalGetPayload<{ select: typeof SOURCE_SELECT }>;
export type AcademicContentReviewDecisionRecoveryCursor = {
  decidedAt: Date;
  id: string;
};

export function reviewDecisionJobData(
  source: AcademicContentReviewDecisionSource,
): CommunicationAcademicContentReviewDecisionJobData {
  const actor =
    source.decidedBy?.status === UserStatus.ACTIVE &&
    source.decidedBy.deletedAt === null
      ? source.decidedBy
      : null;
  return {
    schoolId: source.schoolId,
    organizationId: source.school.organizationId,
    approvalId: source.id,
    actorUserId: actor?.id ?? null,
    actorUserType: actor?.userType ?? null,
  };
}

function eligibleSource(now: Date): Prisma.AcademicContentApprovalWhereInput {
  return {
    status: { in: [Status.APPROVED, Status.CHANGES_REQUESTED] },
    decidedAt: { not: null, lte: now },
    academicContent: {
      deletedAt: null,
      type: AcademicContentType.TEACHER_PREPARATION,
    },
    revision: {
      snapshotContractVersion: 2,
      type: AcademicContentType.TEACHER_PREPARATION,
    },
    school: {
      status: SchoolStatus.ACTIVE,
      deletedAt: null,
      organization: { status: OrganizationStatus.ACTIVE, deletedAt: null },
    },
  };
}

@Injectable()
export class AcademicContentReviewDecisionNotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSource(
    identity: Pick<
      CommunicationAcademicContentReviewDecisionJobData,
      'schoolId' | 'organizationId' | 'approvalId'
    >,
    now: Date,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const source = await tx.academicContentApproval.findFirst({
      where: {
        ...eligibleSource(now),
        id: identity.approvalId,
        schoolId: identity.schoolId,
      },
      select: SOURCE_SELECT,
    });
    if (
      !source ||
      source.school.organizationId !== identity.organizationId ||
      !source.decidedByUserId ||
      !source.decidedAt ||
      source.submittedAt > source.decidedAt ||
      source.roundNumber < 1 ||
      source.academicContent.schoolId !== source.schoolId ||
      source.academicContent.id !== source.academicContentId ||
      source.revision.schoolId !== source.schoolId ||
      source.revision.academicContentId !== source.academicContentId ||
      source.revision.id !== source.revisionId
    )
      return null;
    return source;
  }

  async eligibleRecipient(
    source: AcademicContentReviewDecisionSource,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    return !!(await tx.user.findFirst({
      where: {
        id: source.submittedByUserId,
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
        deletedAt: null,
        memberships: {
          some: {
            schoolId: source.schoolId,
            organizationId: source.school.organizationId,
            userType: UserType.TEACHER,
            status: MembershipStatus.ACTIVE,
            deletedAt: null,
            endedAt: null,
          },
        },
      },
      select: { id: true },
    }));
  }

  /** Lock and re-read source and recipient on Communication's active transaction. */
  async authorize(
    tx: Prisma.TransactionClient,
    identity: CommunicationAcademicContentReviewDecisionJobData,
    now: Date,
  ) {
    const parent = await tx.academicContentApproval.findFirst({
      where: { id: identity.approvalId, schoolId: identity.schoolId },
      select: { academicContentId: true },
    });
    if (!parent) return null;
    await tx.$queryRaw`SELECT id FROM academic_contents WHERE id = ${parent.academicContentId}::uuid AND school_id = ${identity.schoolId}::uuid FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM academic_content_approvals WHERE id = ${identity.approvalId}::uuid AND school_id = ${identity.schoolId}::uuid AND academic_content_id = ${parent.academicContentId}::uuid FOR SHARE`;
    const source = await this.findSource(identity, now, tx);
    if (!source || source.academicContentId !== parent.academicContentId)
      return null;
    await tx.$queryRaw`SELECT id FROM academic_content_revisions WHERE id = ${source.revisionId}::uuid AND school_id = ${identity.schoolId}::uuid AND academic_content_id = ${parent.academicContentId}::uuid FOR SHARE`;
    await tx.$queryRaw`SELECT s.id FROM schools s JOIN organizations o ON o.id = s.organization_id WHERE s.id = ${identity.schoolId}::uuid AND o.id = ${identity.organizationId}::uuid FOR SHARE OF s, o`;
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${source.submittedByUserId}::uuid FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM memberships WHERE user_id = ${source.submittedByUserId}::uuid AND school_id = ${identity.schoolId}::uuid AND user_type = 'TEACHER' ORDER BY id FOR SHARE`;
    const current = await this.findSource(identity, now, tx);
    return current && (await this.eligibleRecipient(current, tx))
      ? current
      : null;
  }

  async listRecoveryCandidates(
    now: Date,
    windowStartedAt: Date,
    after?: AcademicContentReviewDecisionRecoveryCursor,
  ) {
    const rows = await this.prisma.academicContentApproval.findMany({
      where: {
        ...eligibleSource(now),
        decidedAt: { gt: windowStartedAt, lte: now },
        ...(after
          ? {
              OR: [
                { decidedAt: { gt: after.decidedAt } },
                { decidedAt: after.decidedAt, id: { gt: after.id } },
              ],
            }
          : {}),
      },
      select: SOURCE_SELECT,
      orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    const last = rows[rows.length - 1];
    return {
      candidates: rows,
      next:
        rows.length === 100 && last?.decidedAt
          ? { decidedAt: last.decidedAt, id: last.id }
          : null,
    };
  }
}

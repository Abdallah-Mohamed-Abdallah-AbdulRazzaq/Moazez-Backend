import { Injectable } from '@nestjs/common';
import {
  AcademicContentPublicationStatus as Status,
  OrganizationStatus,
  Prisma,
  SchoolStatus,
  UserStatus,
  AcademicContentType,
} from '@prisma/client';
import { ACADEMIC_CONTENT_REMINDER_MAX_MINUTES } from '../domain/academic-content-notification.policy';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  CommunicationAcademicContentNotificationGenerationJobData,
  COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS,
} from '../../../communication/domain/communication-notification-generation-domain';
import { AcademicContentPublicationJobData } from '../domain/academic-content-publication-runtime.constants';
import {
  ACADEMIC_CONTENT_NOTIFICATION_CONTEXT_PAGE_SIZE,
  ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE,
  ACADEMIC_CONTENT_NOTIFICATION_RECOVERY_PAGE_SIZE,
} from '../domain/academic-content-publication-notification.policy';

const SOURCE_SELECT = {
  id: true,
  supersedesPublicationId: true,
  changeSignificance: true,
  notifyMinorUpdate: true,
  schoolId: true,
  academicContentId: true,
  revisionId: true,
  publishedAt: true,
  visibleUntil: true,
  revision: {
    select: {
      id: true,
      schoolId: true,
      academicContentId: true,
      snapshotContractVersion: true,
      title: true,
      type: true,
      audience: true,
    },
  },
  school: { select: { organizationId: true } },
  createdBy: {
    select: { id: true, userType: true, status: true, deletedAt: true },
  },
} satisfies Prisma.AcademicContentPublicationSelect;

const LATER_SOURCE_SELECT = {
  ...SOURCE_SELECT,
  status: true,
  cancellationReason: true,
  cancelledAt: true,
  cancelledBy: {
    select: { id: true, userType: true, status: true, deletedAt: true },
  },
  revision: {
    select: { ...SOURCE_SELECT.revision.select, typeSpecificSnapshot: true },
  },
} satisfies Prisma.AcademicContentPublicationSelect;

export type AcademicContentLaterNotificationSource =
  Prisma.AcademicContentPublicationGetPayload<{
    select: typeof LATER_SOURCE_SELECT;
  }>;
export type AcademicContentLaterEvent =
  | 'academic_content_cancelled'
  | 'online_session_reminder';

export function laterPublicationNotificationJobData(
  source: AcademicContentLaterNotificationSource,
  event: AcademicContentLaterEvent,
): CommunicationAcademicContentNotificationGenerationJobData {
  const candidate =
    event === 'academic_content_cancelled'
      ? source.cancelledBy
      : source.createdBy;
  const actor =
    candidate?.status === UserStatus.ACTIVE && candidate.deletedAt === null
      ? candidate
      : null;
  return {
    schoolId: source.schoolId,
    organizationId: source.school.organizationId,
    contentId: source.academicContentId,
    publicationId: source.id,
    actorUserId: actor?.id ?? null,
    actorUserType: actor?.userType ?? null,
  };
}

function cancellationSourceWhere(
  now: Date,
): Prisma.AcademicContentPublicationWhereInput {
  return {
    ...eligibleSourceWhere(now),
    status: Status.CANCELLED,
    cancellationReason: 'WITHDRAWN',
    publishedAt: { not: null, lte: now },
    cancelledAt: { not: null, lte: now },
    OR: undefined,
  };
}

export type AcademicContentPublishedNotificationSource =
  Prisma.AcademicContentPublicationGetPayload<{ select: typeof SOURCE_SELECT }>;
export type AcademicContentNotificationRecoveryCursor = {
  publishedAt: Date;
  id: string;
};

function eligibleSourceWhere(
  now: Date,
): Prisma.AcademicContentPublicationWhereInput {
  return {
    status: Status.PUBLISHED,
    publishedAt: { not: null, lte: now },
    academicContent: { deletedAt: null },
    revision: { snapshotContractVersion: 2 },
    school: {
      status: SchoolStatus.ACTIVE,
      deletedAt: null,
      organization: { status: OrganizationStatus.ACTIVE, deletedAt: null },
    },
    OR: [{ visibleUntil: null }, { visibleUntil: { gt: now } }],
  };
}

export function publicationNotificationJobData(
  source: AcademicContentPublishedNotificationSource,
): CommunicationAcademicContentNotificationGenerationJobData {
  const actor =
    source.createdBy.status === UserStatus.ACTIVE &&
    source.createdBy.deletedAt === null
      ? source.createdBy
      : null;
  return {
    schoolId: source.schoolId,
    organizationId: source.school.organizationId,
    contentId: source.academicContentId,
    publicationId: source.id,
    actorUserId: actor?.id ?? null,
    actorUserType: actor?.userType ?? null,
  };
}

@Injectable()
export class AcademicContentPublicationNotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findLaterSource(
    identity: AcademicContentPublicationJobData,
    event: AcademicContentLaterEvent,
    now: Date,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.academicContentPublication.findFirst({
      where: {
        ...(event === 'academic_content_cancelled'
          ? cancellationSourceWhere(now)
          : eligibleSourceWhere(now)),
        id: identity.publicationId,
        schoolId: identity.schoolId,
        academicContentId: identity.contentId,
        ...(event === 'online_session_reminder'
          ? {
              revision: {
                snapshotContractVersion: 2,
                type: AcademicContentType.ONLINE_SESSION,
              },
            }
          : {}),
      },
      select: LATER_SOURCE_SELECT,
    });
  }

  async lockLaterSource(
    tx: Prisma.TransactionClient,
    identity: AcademicContentPublicationJobData,
  ) {
    // Same parent/exact-publication order as cancel, expire and revision start.
    await tx.$queryRaw`SELECT id FROM academic_contents WHERE id = ${identity.contentId}::uuid AND school_id = ${identity.schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM academic_content_publications WHERE id = ${identity.publicationId}::uuid AND school_id = ${identity.schoolId}::uuid AND academic_content_id = ${identity.contentId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT s.id FROM schools s JOIN organizations o ON o.id = s.organization_id WHERE s.id = ${identity.schoolId}::uuid FOR SHARE OF s, o`;
    await tx.$queryRaw`SELECT id FROM academic_content_notification_policies WHERE school_id = ${identity.schoolId}::uuid FOR SHARE`;
  }

  findPolicyInTransaction(tx: Prisma.TransactionClient, schoolId: string) {
    return tx.academicContentNotificationPolicy.findFirst({
      where: { schoolId },
    });
  }

  async listLaterRecipientUsers(
    source: AcademicContentLaterNotificationSource,
    after?: string,
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<{ userId: string }>
    >(Prisma.sql`
      SELECT DISTINCT CASE WHEN a.recipient_kind = 'STUDENT' THEN s.user_id ELSE g.user_id END AS "userId"
      FROM academic_content_audience_recipients a
      JOIN students s ON s.id = a.student_id AND s.school_id = a.school_id
      LEFT JOIN guardians g ON g.id = a.guardian_id AND g.school_id = a.school_id
      WHERE a.school_id = ${source.schoolId}::uuid AND a.publication_id = ${source.id}::uuid AND a.revision_id = ${source.revisionId}::uuid
        AND CASE WHEN a.recipient_kind = 'STUDENT' THEN s.user_id ELSE g.user_id END IS NOT NULL
        ${after ? Prisma.sql`AND CASE WHEN a.recipient_kind = 'STUDENT' THEN s.user_id ELSE g.user_id END > ${after}::uuid` : Prisma.empty}
      ORDER BY "userId" ASC LIMIT ${ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE}`);
    return rows.map((row) => row.userId);
  }

  async listCurrentLaterContexts(
    tx: Prisma.TransactionClient,
    source: AcademicContentPublishedNotificationSource,
    userIds: string[],
    after?: string,
    frozenRecipient = false,
  ) {
    if (!userIds.length)
      return { contexts: [], next: undefined as string | undefined };
    if (userIds.length > ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE)
      throw new Error('academic_content_notification_batch_invalid');
    const users = Prisma.join(userIds.map((id) => Prisma.sql`${id}::uuid`));
    const ids = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT a.id FROM academic_content_audience_recipients a
      JOIN students s ON s.id = a.student_id AND s.school_id = a.school_id
      LEFT JOIN guardians g ON g.id = a.guardian_id AND g.school_id = a.school_id
      WHERE a.school_id = ${source.schoolId}::uuid AND a.publication_id = ${source.id}::uuid AND a.revision_id = ${source.revisionId}::uuid
        AND CASE WHEN a.recipient_kind = 'STUDENT' THEN s.user_id ELSE g.user_id END IN (${users})
        ${after ? Prisma.sql`AND a.id > ${after}::uuid` : Prisma.empty}
      ORDER BY a.id ASC LIMIT ${ACADEMIC_CONTENT_NOTIFICATION_CONTEXT_PAGE_SIZE}`);
    if (!ids.length)
      return { contexts: [], next: undefined as string | undefined };
    const contextIds = Prisma.join(
      ids.map(({ id }) => Prisma.sql`${id}::uuid`),
    );
    const common = Prisma.sql`a.id IN (${contextIds}) AND a.school_id = ${source.schoolId}::uuid AND a.publication_id = ${source.id}::uuid AND a.revision_id = ${source.revisionId}::uuid
      AND s.status = 'ACTIVE' AND s.deleted_at IS NULL AND e.status = 'ACTIVE' AND e.deleted_at IS NULL
      AND e.student_id = a.student_id AND e.classroom_id = a.classroom_id
      AND u.status = 'ACTIVE' AND u.deleted_at IS NULL AND u.id IN (${users})
      ${frozenRecipient ? Prisma.sql`AND a.recipient_user_id = u.id` : Prisma.empty}`;
    type Context = {
      id: string;
      recipientUserId: string;
      recipientKind: 'STUDENT' | 'GUARDIAN';
      studentId: string;
    };
    const students = await tx.$queryRaw<Context[]>(Prisma.sql`
      SELECT a.id, u.id AS "recipientUserId", a.recipient_kind AS "recipientKind", a.student_id AS "studentId"
      FROM academic_content_audience_recipients a
      JOIN students s ON s.id = a.student_id AND s.school_id = a.school_id
      JOIN student_enrollments e ON e.id = a.enrollment_id AND e.school_id = a.school_id
      JOIN users u ON u.id = s.user_id
      WHERE ${common} AND a.recipient_kind = 'STUDENT' AND u.user_type = 'STUDENT'
      ORDER BY a.id FOR SHARE OF a, s, e, u`);
    const guardians = await tx.$queryRaw<Context[]>(Prisma.sql`
      SELECT a.id, u.id AS "recipientUserId", a.recipient_kind AS "recipientKind", a.student_id AS "studentId"
      FROM academic_content_audience_recipients a
      JOIN students s ON s.id = a.student_id AND s.school_id = a.school_id
      JOIN student_enrollments e ON e.id = a.enrollment_id AND e.school_id = a.school_id
      JOIN guardians g ON g.id = a.guardian_id AND g.school_id = a.school_id
      JOIN student_guardian_links l ON l.school_id = a.school_id AND l.student_id = a.student_id AND l.guardian_id = a.guardian_id
      JOIN users u ON u.id = g.user_id
      WHERE ${common} AND a.recipient_kind = 'GUARDIAN' AND u.user_type = 'PARENT'
        AND g.deleted_at IS NULL AND g.can_receive_notifications IS DISTINCT FROM false
        ${frozenRecipient ? Prisma.sql`AND a.guardian_can_receive_notifications IS DISTINCT FROM false` : Prisma.empty}
      ORDER BY a.id FOR SHARE OF a, s, e, g, l, u`);
    return {
      contexts: [...students, ...guardians],
      next:
        ids.length === ACADEMIC_CONTENT_NOTIFICATION_CONTEXT_PAGE_SIZE
          ? ids[ids.length - 1].id
          : undefined,
    };
  }

  listCancellationRecoveryCandidates(
    now: Date,
    after?: { cancelledAt: Date; id: string },
  ) {
    return this.prisma.academicContentPublication.findMany({
      where: {
        ...cancellationSourceWhere(now),
        cancelledAt: {
          gt: new Date(
            now.getTime() - COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS,
          ),
          lte: now,
        },
        ...(after
          ? {
              AND: [
                {
                  OR: [
                    { cancelledAt: { gt: after.cancelledAt } },
                    { cancelledAt: after.cancelledAt, id: { gt: after.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      select: LATER_SOURCE_SELECT,
      orderBy: [{ cancelledAt: 'asc' }, { id: 'asc' }],
      take: ACADEMIC_CONTENT_NOTIFICATION_RECOVERY_PAGE_SIZE,
    });
  }

  listReminderRecoveryCandidates(now: Date, after?: string) {
    // V2 instant decoding requires canonical UTC ISO; JSON string bounds avoid unsafe casts of corrupt snapshots.
    return this.prisma.academicContentPublication.findMany({
      where: {
        ...eligibleSourceWhere(now),
        ...(after ? { id: { gt: after } } : {}),
        revision: {
          snapshotContractVersion: 2,
          type: AcademicContentType.ONLINE_SESSION,
          typeSpecificSnapshot: {
            path: ['state', 'startAt'],
            gt: now.toISOString(),
            lte: new Date(
              now.getTime() +
                COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS +
                ACADEMIC_CONTENT_REMINDER_MAX_MINUTES * 60_000,
            ).toISOString(),
          },
        },
      },
      select: LATER_SOURCE_SELECT,
      orderBy: { id: 'asc' },
      take: ACADEMIC_CONTENT_NOTIFICATION_RECOVERY_PAGE_SIZE,
    });
  }

  findSource(
    identity: AcademicContentPublicationJobData,
    now: Date,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.academicContentPublication.findFirst({
      where: {
        ...eligibleSourceWhere(now),
        id: identity.publicationId,
        schoolId: identity.schoolId,
        academicContentId: identity.contentId,
      },
      select: SOURCE_SELECT,
    });
  }

  findPolicy(schoolId: string) {
    return this.prisma.academicContentNotificationPolicy.findUnique({
      where: { schoolId },
    });
  }

  async listRecipientUsers(
    source: AcademicContentPublishedNotificationSource,
    after?: string,
  ) {
    // GROUP BY is executed in PostgreSQL, so context duplicates cannot consume a user page.
    const rows = await this.prisma.academicContentAudienceRecipient.groupBy({
      by: ['recipientUserId'],
      where: {
        schoolId: source.schoolId,
        publicationId: source.id,
        revisionId: source.revisionId,
        recipientUserId: { not: null, ...(after ? { gt: after } : {}) },
      },
      orderBy: { recipientUserId: 'asc' },
      take: ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE,
    });
    return rows.flatMap((row) =>
      row.recipientUserId ? [row.recipientUserId] : [],
    );
  }

  listContexts(
    source: AcademicContentPublishedNotificationSource,
    userIds: string[],
    after?: string,
  ) {
    if (userIds.length > ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE)
      throw new Error('academic_content_notification_batch_invalid');
    return this.prisma.academicContentAudienceRecipient.findMany({
      where: {
        schoolId: source.schoolId,
        publicationId: source.id,
        revisionId: source.revisionId,
        recipientUserId: { in: userIds },
        ...(after ? { id: { gt: after } } : {}),
      },
      select: {
        id: true,
        recipientUserId: true,
        recipientKind: true,
        studentId: true,
        guardianCanReceiveNotifications: true,
      },
      orderBy: { id: 'asc' },
      take: ACADEMIC_CONTENT_NOTIFICATION_CONTEXT_PAGE_SIZE,
    });
  }

  listCurrentUsers(userIds: string[]) {
    if (userIds.length > ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE)
      throw new Error('academic_content_notification_batch_invalid');
    return this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true, userType: true, status: true, deletedAt: true },
      take: ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE,
    });
  }

  listRecoveryCandidates(
    now: Date,
    after?: AcademicContentNotificationRecoveryCursor,
  ) {
    const windowStartedAt = new Date(
      now.getTime() - COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS,
    );
    return this.prisma.academicContentPublication.findMany({
      where: {
        ...eligibleSourceWhere(now),
        publishedAt: { gt: windowStartedAt, lte: now },
        ...(after
          ? {
              AND: [
                {
                  OR: [
                    { publishedAt: { gt: after.publishedAt } },
                    { publishedAt: after.publishedAt, id: { gt: after.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      select: SOURCE_SELECT,
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
      take: ACADEMIC_CONTENT_NOTIFICATION_RECOVERY_PAGE_SIZE,
    });
  }
}

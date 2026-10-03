import { Injectable } from '@nestjs/common';
import {
  AcademicContentPublicationStatus as Status,
  OrganizationStatus,
  Prisma,
  SchoolStatus,
  UserStatus,
} from '@prisma/client';
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

  findSource(identity: AcademicContentPublicationJobData, now: Date) {
    return this.prisma.academicContentPublication.findFirst({
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

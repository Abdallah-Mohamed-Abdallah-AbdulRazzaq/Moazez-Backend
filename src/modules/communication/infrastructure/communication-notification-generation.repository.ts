import { Injectable } from '@nestjs/common';
import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementStatus,
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
  MembershipStatus,
  Prisma,
  StudentEnrollmentStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATION_SOURCE_TYPE,
  COMMUNICATION_IN_APP_NOTIFICATION_PROVIDER,
  deduplicateRecipientUserIds,
} from '../domain/communication-notification-generation-domain';

const COMMUNICATION_ANNOUNCEMENT_FOR_NOTIFICATION_GENERATION_ARGS =
  Prisma.validator<Prisma.CommunicationAnnouncementDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      title: true,
      body: true,
      status: true,
      priority: true,
      audienceType: true,
      publishedAt: true,
      expiresAt: true,
      createdById: true,
      publishedById: true,
      audiences: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          audienceType: true,
          stageId: true,
          gradeId: true,
          sectionId: true,
          classroomId: true,
          studentId: true,
          guardianId: true,
          userId: true,
        },
      },
    },
  });

export type CommunicationAnnouncementForNotificationGeneration =
  Prisma.CommunicationAnnouncementGetPayload<
    typeof COMMUNICATION_ANNOUNCEMENT_FOR_NOTIFICATION_GENERATION_ARGS
  >;

export interface CommunicationAnnouncementNotificationCreateInput {
  schoolId: string;
  announcementId: string;
  recipientUserIds: string[];
  actorUserId: string | null;
  title: string;
  body: string;
  priority: CommunicationNotificationPriority;
  expiresAt: Date | null;
  metadata: Record<string, unknown>;
  now: Date;
}

export interface CommunicationAnnouncementNotificationCreateResult {
  recipientCount: number;
  createdNotificationCount: number;
  existingNotificationCount: number;
  createdDeliveryCount: number;
  existingDeliveryCount: number;
}

interface AudienceTargetIds {
  stageIds: string[];
  gradeIds: string[];
  sectionIds: string[];
  classroomIds: string[];
  studentIds: string[];
  guardianIds: string[];
  userIds: string[];
}

@Injectable()
export class CommunicationNotificationGenerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findPublishedCurrentSchoolAnnouncementForNotificationGeneration(
    announcementId: string,
  ): Promise<CommunicationAnnouncementForNotificationGeneration | null> {
    return this.scopedPrisma.communicationAnnouncement.findFirst({
      where: {
        id: announcementId,
        status: CommunicationAnnouncementStatus.PUBLISHED,
      },
      ...COMMUNICATION_ANNOUNCEMENT_FOR_NOTIFICATION_GENERATION_ARGS,
    });
  }

  async resolveCurrentSchoolAnnouncementRecipientUserIds(
    announcement: CommunicationAnnouncementForNotificationGeneration,
  ): Promise<string[]> {
    if (
      announcement.audienceType === CommunicationAnnouncementAudienceType.SCHOOL
    ) {
      return this.listActiveCurrentSchoolMembershipUserIds();
    }

    const targets = collectAudienceTargetIds(announcement.audiences);
    const candidateUserIds: string[] = [];

    candidateUserIds.push(
      ...(await this.resolveAcademicScopeUserIds(targets)),
      ...(await this.resolveStudentGuardianUserIds(targets.studentIds)),
      ...(await this.resolveGuardianUserIds(targets.guardianIds)),
      ...targets.userIds,
    );

    return this.filterActiveCurrentSchoolUserIds(candidateUserIds);
  }

  async createMissingAnnouncementPublishedNotifications(
    input: CommunicationAnnouncementNotificationCreateInput,
  ): Promise<CommunicationAnnouncementNotificationCreateResult> {
    const recipientUserIds = deduplicateRecipientUserIds(
      input.recipientUserIds,
    );

    if (recipientUserIds.length === 0) {
      return {
        recipientCount: 0,
        createdNotificationCount: 0,
        existingNotificationCount: 0,
        createdDeliveryCount: 0,
        existingDeliveryCount: 0,
      };
    }

    return this.scopedPrisma.$transaction(async (tx) => {
      await this.lockAnnouncementGenerationInTransaction(tx, {
        schoolId: input.schoolId,
        announcementId: input.announcementId,
      });

      const existingNotifications = await tx.communicationNotification.findMany(
        {
          where: {
            recipientUserId: { in: recipientUserIds },
            sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
            sourceType: COMMUNICATION_ANNOUNCEMENT_NOTIFICATION_SOURCE_TYPE,
            sourceId: input.announcementId,
            type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
          },
          select: { id: true, recipientUserId: true },
        },
      );
      const existingRecipientIds = new Set(
        existingNotifications.map(
          (notification) => notification.recipientUserId,
        ),
      );
      const createdNotificationIds: string[] = [];

      for (const recipientUserId of recipientUserIds) {
        if (existingRecipientIds.has(recipientUserId)) continue;

        const created = await tx.communicationNotification.create({
          data: {
            schoolId: input.schoolId,
            recipientUserId,
            actorUserId: input.actorUserId,
            sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
            sourceType: COMMUNICATION_ANNOUNCEMENT_NOTIFICATION_SOURCE_TYPE,
            sourceId: input.announcementId,
            type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
            title: input.title,
            body: input.body,
            priority: input.priority,
            status: CommunicationNotificationStatus.UNREAD,
            expiresAt: input.expiresAt,
            metadata: input.metadata as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        createdNotificationIds.push(created.id);
      }

      const notificationIds = [
        ...existingNotifications.map((notification) => notification.id),
        ...createdNotificationIds,
      ];
      const existingDeliveries =
        await tx.communicationNotificationDelivery.findMany({
          where: {
            notificationId: { in: notificationIds },
            channel: CommunicationNotificationDeliveryChannel.IN_APP,
          },
          select: { notificationId: true },
        });
      const notificationIdsWithDelivery = new Set(
        existingDeliveries.map((delivery) => delivery.notificationId),
      );
      const missingDeliveryNotificationIds = notificationIds.filter(
        (notificationId) => !notificationIdsWithDelivery.has(notificationId),
      );

      if (missingDeliveryNotificationIds.length > 0) {
        await tx.communicationNotificationDelivery.createMany({
          data: missingDeliveryNotificationIds.map((notificationId) => ({
            schoolId: input.schoolId,
            notificationId,
            channel: CommunicationNotificationDeliveryChannel.IN_APP,
            status: CommunicationNotificationDeliveryStatus.DELIVERED,
            provider: COMMUNICATION_IN_APP_NOTIFICATION_PROVIDER,
            attemptedAt: input.now,
            deliveredAt: input.now,
          })),
        });
      }

      return {
        recipientCount: recipientUserIds.length,
        createdNotificationCount: createdNotificationIds.length,
        existingNotificationCount: existingNotifications.length,
        createdDeliveryCount: missingDeliveryNotificationIds.length,
        existingDeliveryCount: existingDeliveries.length,
      };
    });
  }

  private async listActiveCurrentSchoolMembershipUserIds(): Promise<string[]> {
    const memberships = await this.scopedPrisma.membership.findMany({
      where: {
        status: MembershipStatus.ACTIVE,
        user: {
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      },
      select: { userId: true },
    });

    return deduplicateRecipientUserIds(
      memberships.map((membership) => membership.userId),
    );
  }

  private async resolveAcademicScopeUserIds(
    targets: AudienceTargetIds,
  ): Promise<string[]> {
    const classroomIds = deduplicateRecipientUserIds([
      ...targets.classroomIds,
      ...(await this.findClassroomIdsForSectionIds(targets.sectionIds)),
      ...(await this.findClassroomIdsForGradeIds(targets.gradeIds)),
      ...(await this.findClassroomIdsForStageIds(targets.stageIds)),
    ]);

    return this.resolveClassroomCandidateUserIds(classroomIds);
  }

  private async findClassroomIdsForStageIds(
    stageIds: string[],
  ): Promise<string[]> {
    if (stageIds.length === 0) return [];

    const classrooms = await this.scopedPrisma.classroom.findMany({
      where: {
        section: {
          grade: {
            stageId: { in: deduplicateRecipientUserIds(stageIds) },
          },
        },
      },
      select: { id: true },
    });

    return classrooms.map((classroom) => classroom.id);
  }

  private async findClassroomIdsForGradeIds(
    gradeIds: string[],
  ): Promise<string[]> {
    if (gradeIds.length === 0) return [];

    const classrooms = await this.scopedPrisma.classroom.findMany({
      where: {
        section: {
          gradeId: { in: deduplicateRecipientUserIds(gradeIds) },
        },
      },
      select: { id: true },
    });

    return classrooms.map((classroom) => classroom.id);
  }

  private async findClassroomIdsForSectionIds(
    sectionIds: string[],
  ): Promise<string[]> {
    if (sectionIds.length === 0) return [];

    const classrooms = await this.scopedPrisma.classroom.findMany({
      where: {
        sectionId: { in: deduplicateRecipientUserIds(sectionIds) },
      },
      select: { id: true },
    });

    return classrooms.map((classroom) => classroom.id);
  }

  private async resolveClassroomCandidateUserIds(
    classroomIds: string[],
  ): Promise<string[]> {
    const uniqueClassroomIds = deduplicateRecipientUserIds(classroomIds);
    if (uniqueClassroomIds.length === 0) return [];

    const [enrollments, allocations] = await Promise.all([
      this.scopedPrisma.enrollment.findMany({
        where: {
          classroomId: { in: uniqueClassroomIds },
          status: StudentEnrollmentStatus.ACTIVE,
        },
        select: {
          student: {
            select: {
              guardians: {
                select: {
                  guardian: {
                    select: { userId: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.scopedPrisma.teacherSubjectAllocation.findMany({
        where: {
          classroomId: { in: uniqueClassroomIds },
        },
        select: { teacherUserId: true },
      }),
    ]);

    return deduplicateRecipientUserIds([
      ...allocations.map((allocation) => allocation.teacherUserId),
      ...enrollments.flatMap((enrollment) =>
        enrollment.student.guardians
          .map((link) => link.guardian.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    ]);
  }

  private async resolveStudentGuardianUserIds(
    studentIds: string[],
  ): Promise<string[]> {
    const uniqueStudentIds = deduplicateRecipientUserIds(studentIds);
    if (uniqueStudentIds.length === 0) return [];

    const links = await this.scopedPrisma.studentGuardian.findMany({
      where: {
        studentId: { in: uniqueStudentIds },
      },
      select: {
        guardian: {
          select: { userId: true },
        },
      },
    });

    return links
      .map((link) => link.guardian.userId)
      .filter((userId): userId is string => Boolean(userId));
  }

  private async resolveGuardianUserIds(
    guardianIds: string[],
  ): Promise<string[]> {
    const uniqueGuardianIds = deduplicateRecipientUserIds(guardianIds);
    if (uniqueGuardianIds.length === 0) return [];

    const guardians = await this.scopedPrisma.guardian.findMany({
      where: {
        id: { in: uniqueGuardianIds },
      },
      select: { userId: true },
    });

    return guardians
      .map((guardian) => guardian.userId)
      .filter((userId): userId is string => Boolean(userId));
  }

  private async filterActiveCurrentSchoolUserIds(
    candidateUserIds: string[],
  ): Promise<string[]> {
    const uniqueUserIds = deduplicateRecipientUserIds(candidateUserIds);
    if (uniqueUserIds.length === 0) return [];

    const memberships = await this.scopedPrisma.membership.findMany({
      where: {
        userId: { in: uniqueUserIds },
        status: MembershipStatus.ACTIVE,
        user: {
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      },
      select: { userId: true },
    });

    return deduplicateRecipientUserIds(
      memberships.map((membership) => membership.userId),
    );
  }

  private async lockAnnouncementGenerationInTransaction(
    tx: Prisma.TransactionClient,
    input: { schoolId: string; announcementId: string },
  ): Promise<void> {
    const lockKey = `communication:announcement-notifications:${input.schoolId}:${input.announcementId}`;
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `;
  }
}

function collectAudienceTargetIds(
  audiences: CommunicationAnnouncementForNotificationGeneration['audiences'],
): AudienceTargetIds {
  const targets: AudienceTargetIds = {
    stageIds: [],
    gradeIds: [],
    sectionIds: [],
    classroomIds: [],
    studentIds: [],
    guardianIds: [],
    userIds: [],
  };

  for (const audience of audiences) {
    if (audience.stageId) targets.stageIds.push(audience.stageId);
    if (audience.gradeId) targets.gradeIds.push(audience.gradeId);
    if (audience.sectionId) targets.sectionIds.push(audience.sectionId);
    if (audience.classroomId) {
      targets.classroomIds.push(audience.classroomId);
    }
    if (audience.studentId) targets.studentIds.push(audience.studentId);
    if (audience.guardianId) targets.guardianIds.push(audience.guardianId);
    if (audience.userId) targets.userIds.push(audience.userId);
  }

  return {
    stageIds: deduplicateRecipientUserIds(targets.stageIds),
    gradeIds: deduplicateRecipientUserIds(targets.gradeIds),
    sectionIds: deduplicateRecipientUserIds(targets.sectionIds),
    classroomIds: deduplicateRecipientUserIds(targets.classroomIds),
    studentIds: deduplicateRecipientUserIds(targets.studentIds),
    guardianIds: deduplicateRecipientUserIds(targets.guardianIds),
    userIds: deduplicateRecipientUserIds(targets.userIds),
  };
}

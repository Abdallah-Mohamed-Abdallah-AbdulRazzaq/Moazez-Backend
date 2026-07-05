import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const DISMISSAL_NOTIFICATION_LIST_ARGS =
  Prisma.validator<Prisma.CommunicationNotificationDefaultArgs>()({
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      status: true,
      readAt: true,
      metadata: true,
      createdAt: true,
    },
  });

export type DismissalNotificationRecord =
  Prisma.CommunicationNotificationGetPayload<
    typeof DISMISSAL_NOTIFICATION_LIST_ARGS
  >;

export interface DismissalNotificationListFilters {
  recipientUserId: string;
  type?: CommunicationNotificationType;
  unreadOnly: boolean;
  page: number;
  limit: number;
  sort: 'created_at_desc' | 'created_at_asc';
}

export interface DismissalNotificationSummaryCounts {
  totalCount: number;
  unreadCount: number;
  requestCreatedCount: number;
  requestCancelledCount: number;
  requestCalledCount: number;
  requestReadyCount: number;
  requestHandedOverCount: number;
}

export interface DismissalNotificationListResult {
  items: DismissalNotificationRecord[];
  page: number;
  limit: number;
  totalPages: number;
  summary: DismissalNotificationSummaryCounts;
}

@Injectable()
export class DismissalNotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listCurrentActorNotifications(
    filters: DismissalNotificationListFilters,
  ): Promise<DismissalNotificationListResult> {
    const where = buildDismissalNotificationWhere(filters);
    const [items, totalCount, unreadCount, groupedCounts] = await Promise.all([
      this.scopedPrisma.communicationNotification.findMany({
        where,
        orderBy: [
          { createdAt: filters.sort === 'created_at_asc' ? 'asc' : 'desc' },
          { id: 'asc' },
        ],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        ...DISMISSAL_NOTIFICATION_LIST_ARGS,
      }),
      this.scopedPrisma.communicationNotification.count({ where }),
      this.scopedPrisma.communicationNotification.count({
        where: {
          ...where,
          status: CommunicationNotificationStatus.UNREAD,
        },
      }),
      this.scopedPrisma.communicationNotification.groupBy({
        by: ['type'],
        where,
        _count: { _all: true },
      }),
    ]);

    return {
      items,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.max(1, Math.ceil(totalCount / filters.limit)),
      summary: summarizeNotificationCounts({
        totalCount,
        unreadCount,
        groupedCounts,
      }),
    };
  }

  findCurrentActorNotification(params: {
    notificationId: string;
    recipientUserId: string;
  }): Promise<DismissalNotificationRecord | null> {
    return this.scopedPrisma.communicationNotification.findFirst({
      where: {
        id: params.notificationId,
        recipientUserId: params.recipientUserId,
        sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
      },
      ...DISMISSAL_NOTIFICATION_LIST_ARGS,
    });
  }

  async markCurrentActorNotificationRead(params: {
    notificationId: string;
    recipientUserId: string;
    readAt: Date;
  }): Promise<DismissalNotificationRecord | null> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const current = await tx.communicationNotification.findFirst({
        where: {
          id: params.notificationId,
          recipientUserId: params.recipientUserId,
          sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
        },
        select: { id: true, status: true, readAt: true },
      });

      if (!current) return null;

      if (
        current.status !== CommunicationNotificationStatus.READ ||
        !current.readAt
      ) {
        await tx.communicationNotification.updateMany({
          where: {
            id: params.notificationId,
            recipientUserId: params.recipientUserId,
            sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
          },
          data: {
            status: CommunicationNotificationStatus.READ,
            readAt: current.readAt ?? params.readAt,
          },
        });
      }

      return tx.communicationNotification.findFirst({
        where: {
          id: params.notificationId,
          recipientUserId: params.recipientUserId,
          sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
        },
        ...DISMISSAL_NOTIFICATION_LIST_ARGS,
      });
    });
  }

  async markAllCurrentActorNotificationsRead(params: {
    recipientUserId: string;
    readAt: Date;
  }): Promise<{ updatedCount: number }> {
    const result = await this.scopedPrisma.communicationNotification.updateMany({
      where: {
        recipientUserId: params.recipientUserId,
        sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
        status: CommunicationNotificationStatus.UNREAD,
      },
      data: {
        status: CommunicationNotificationStatus.READ,
        readAt: params.readAt,
      },
    });

    return { updatedCount: result.count };
  }
}

function buildDismissalNotificationWhere(
  filters: DismissalNotificationListFilters,
): Prisma.CommunicationNotificationWhereInput {
  return {
    recipientUserId: filters.recipientUserId,
    sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.unreadOnly
      ? { status: CommunicationNotificationStatus.UNREAD }
      : {}),
  };
}

function summarizeNotificationCounts(params: {
  totalCount: number;
  unreadCount: number;
  groupedCounts: Array<{
    type: CommunicationNotificationType;
    _count: { _all: number };
  }>;
}): DismissalNotificationSummaryCounts {
  const countByType = new Map(
    params.groupedCounts.map((item) => [item.type, item._count._all]),
  );

  return {
    totalCount: params.totalCount,
    unreadCount: params.unreadCount,
    requestCreatedCount:
      countByType.get(CommunicationNotificationType.DISMISSAL_REQUEST_CREATED) ??
      0,
    requestCancelledCount:
      countByType.get(
        CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED,
      ) ?? 0,
    requestCalledCount:
      countByType.get(CommunicationNotificationType.DISMISSAL_REQUEST_CALLED) ??
      0,
    requestReadyCount:
      countByType.get(CommunicationNotificationType.DISMISSAL_REQUEST_READY) ??
      0,
    requestHandedOverCount:
      countByType.get(
        CommunicationNotificationType.DISMISSAL_REQUEST_HANDED_OVER,
      ) ?? 0,
  };
}

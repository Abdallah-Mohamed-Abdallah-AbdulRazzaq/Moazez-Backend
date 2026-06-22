import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationPreferenceCategory,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const COMMUNICATION_NOTIFICATION_PREFERENCE_ARGS =
  Prisma.validator<Prisma.CommunicationNotificationPreferenceDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      userId: true,
      category: true,
      inAppEnabled: true,
      pushEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

export type CommunicationNotificationPreferenceRecord =
  Prisma.CommunicationNotificationPreferenceGetPayload<
    typeof COMMUNICATION_NOTIFICATION_PREFERENCE_ARGS
  >;

export interface CommunicationNotificationPreferenceUpsertInput {
  category: CommunicationNotificationPreferenceCategory;
  inAppEnabled?: boolean;
  pushEnabled?: boolean;
}

@Injectable()
export class CommunicationNotificationPreferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listCurrentSchoolUserPreferences(input: {
    schoolId: string;
    userId: string;
  }): Promise<CommunicationNotificationPreferenceRecord[]> {
    return this.scopedPrisma.communicationNotificationPreference.findMany({
      where: {
        schoolId: input.schoolId,
        userId: input.userId,
      },
      orderBy: [{ category: 'asc' }],
      ...COMMUNICATION_NOTIFICATION_PREFERENCE_ARGS,
    });
  }

  async upsertCurrentSchoolUserPreferences(input: {
    schoolId: string;
    userId: string;
    preferences: CommunicationNotificationPreferenceUpsertInput[];
  }): Promise<CommunicationNotificationPreferenceRecord[]> {
    const uniquePreferences = new Map<
      CommunicationNotificationPreferenceCategory,
      {
        inAppEnabled?: boolean;
        pushEnabled?: boolean;
      }
    >();

    for (const preference of input.preferences) {
      const current = uniquePreferences.get(preference.category) ?? {};
      uniquePreferences.set(preference.category, {
        ...current,
        ...(typeof preference.inAppEnabled !== 'undefined'
          ? { inAppEnabled: preference.inAppEnabled }
          : {}),
        ...(typeof preference.pushEnabled !== 'undefined'
          ? { pushEnabled: preference.pushEnabled }
          : {}),
      });
    }

    await this.scopedPrisma.$transaction(
      [...uniquePreferences.entries()].map(([category, preference]) =>
        this.scopedPrisma.communicationNotificationPreference.upsert({
          where: {
            schoolId_userId_category: {
              schoolId: input.schoolId,
              userId: input.userId,
              category,
            },
          },
          create: {
            schoolId: input.schoolId,
            userId: input.userId,
            category,
            ...(typeof preference.inAppEnabled !== 'undefined'
              ? { inAppEnabled: preference.inAppEnabled }
              : {}),
            ...(typeof preference.pushEnabled !== 'undefined'
              ? { pushEnabled: preference.pushEnabled }
              : {}),
          },
          update: {
            ...(typeof preference.inAppEnabled !== 'undefined'
              ? { inAppEnabled: preference.inAppEnabled }
              : {}),
            ...(typeof preference.pushEnabled !== 'undefined'
              ? { pushEnabled: preference.pushEnabled }
              : {}),
          },
        }),
      ),
    );

    return this.listCurrentSchoolUserPreferences({
      schoolId: input.schoolId,
      userId: input.userId,
    });
  }

  async isCurrentSchoolInAppNotificationEnabled(input: {
    schoolId: string;
    userId: string;
    category: CommunicationNotificationPreferenceCategory;
  }): Promise<boolean> {
    const preference =
      await this.scopedPrisma.communicationNotificationPreference.findFirst({
        where: {
          schoolId: input.schoolId,
          userId: input.userId,
          category: input.category,
        },
        select: { inAppEnabled: true },
      });

    return preference?.inAppEnabled ?? true;
  }

  async listCurrentSchoolDisabledUserIdsForCategory(input: {
    schoolId: string;
    userIds: string[];
    category: CommunicationNotificationPreferenceCategory;
  }): Promise<string[]> {
    if (input.userIds.length === 0) return [];

    const preferences =
      await this.scopedPrisma.communicationNotificationPreference.findMany({
        where: {
          schoolId: input.schoolId,
          userId: { in: [...new Set(input.userIds)] },
          category: input.category,
          inAppEnabled: false,
        },
        select: { userId: true },
      });

    return preferences.map((preference) => preference.userId);
  }

  async listCurrentSchoolPushDisabledUserIdsForCategory(input: {
    schoolId: string;
    userIds: string[];
    category: CommunicationNotificationPreferenceCategory;
  }): Promise<string[]> {
    if (input.userIds.length === 0) return [];

    const preferences =
      await this.scopedPrisma.communicationNotificationPreference.findMany({
        where: {
          schoolId: input.schoolId,
          userId: { in: [...new Set(input.userIds)] },
          category: input.category,
          pushEnabled: false,
        },
        select: { userId: true },
      });

    return preferences.map((preference) => preference.userId);
  }
}

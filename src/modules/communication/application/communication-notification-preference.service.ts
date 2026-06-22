import { Injectable } from '@nestjs/common';
import { CommunicationNotificationPreferenceCategory } from '@prisma/client';
import {
  assertPreferenceUpdateHasAtLeastOneChannel,
  normalizeCommunicationNotificationPreferenceCategory,
  resolvePreferenceBoolean,
} from '../domain/communication-notification-preference-domain';
import {
  CommunicationNotificationPreferenceRepository,
  CommunicationNotificationPreferenceUpsertInput,
} from '../infrastructure/communication-notification-preference.repository';
import {
  buildDefaultedCommunicationNotificationPreferences,
  presentCommunicationNotificationPreferences,
} from '../presenters/communication-notification-preference.presenter';
import { CommunicationAppNotificationAliasStyle } from '../presenters/communication-app-notification.presenter';

export interface CommunicationNotificationPreferenceUpdateItem {
  category: string;
  inAppEnabled?: boolean;
  in_app_enabled?: boolean;
  pushEnabled?: boolean;
  push_enabled?: boolean;
}

@Injectable()
export class CommunicationNotificationPreferenceService {
  constructor(
    private readonly preferenceRepository: CommunicationNotificationPreferenceRepository,
  ) {}

  async getPreferencesForActor(params: {
    schoolId: string;
    userId: string;
    aliasStyle: CommunicationAppNotificationAliasStyle;
  }) {
    const preferences =
      await this.preferenceRepository.listCurrentSchoolUserPreferences({
        schoolId: params.schoolId,
        userId: params.userId,
      });

    return presentCommunicationNotificationPreferences({
      preferences:
        buildDefaultedCommunicationNotificationPreferences(preferences),
      aliasStyle: params.aliasStyle,
    });
  }

  async updatePreferencesForActor(params: {
    schoolId: string;
    userId: string;
    preferences: CommunicationNotificationPreferenceUpdateItem[];
    aliasStyle: CommunicationAppNotificationAliasStyle;
  }) {
    const updates = normalizePreferenceUpdates(params.preferences);
    const preferences =
      await this.preferenceRepository.upsertCurrentSchoolUserPreferences({
        schoolId: params.schoolId,
        userId: params.userId,
        preferences: updates,
      });

    return presentCommunicationNotificationPreferences({
      preferences:
        buildDefaultedCommunicationNotificationPreferences(preferences),
      aliasStyle: params.aliasStyle,
    });
  }

  shouldCreateInAppNotification(params: {
    schoolId: string;
    recipientUserId: string;
    category: CommunicationNotificationPreferenceCategory;
  }): Promise<boolean> {
    return this.preferenceRepository.isCurrentSchoolInAppNotificationEnabled({
      schoolId: params.schoolId,
      userId: params.recipientUserId,
      category: params.category,
    });
  }

  async filterInAppEnabledRecipientUserIds(params: {
    schoolId: string;
    recipientUserIds: string[];
    category: CommunicationNotificationPreferenceCategory;
  }): Promise<string[]> {
    const recipientUserIds = [
      ...new Set(params.recipientUserIds.filter((userId) => userId.length > 0)),
    ];
    if (recipientUserIds.length === 0) return [];

    const disabledUserIds =
      await this.preferenceRepository.listCurrentSchoolDisabledUserIdsForCategory(
        {
          schoolId: params.schoolId,
          userIds: recipientUserIds,
          category: params.category,
        },
      );
    const disabled = new Set(disabledUserIds);

    return recipientUserIds.filter((userId) => !disabled.has(userId));
  }

  async filterPushEnabledRecipientUserIds(params: {
    schoolId: string;
    recipientUserIds: string[];
    category: CommunicationNotificationPreferenceCategory;
  }): Promise<string[]> {
    const recipientUserIds = [
      ...new Set(params.recipientUserIds.filter((userId) => userId.length > 0)),
    ];
    if (recipientUserIds.length === 0) return [];

    const disabledUserIds =
      await this.preferenceRepository.listCurrentSchoolPushDisabledUserIdsForCategory(
        {
          schoolId: params.schoolId,
          userIds: recipientUserIds,
          category: params.category,
        },
      );
    const disabled = new Set(disabledUserIds);

    return recipientUserIds.filter((userId) => !disabled.has(userId));
  }
}

function normalizePreferenceUpdates(
  preferences: CommunicationNotificationPreferenceUpdateItem[],
): CommunicationNotificationPreferenceUpsertInput[] {
  const byCategory = new Map<
    CommunicationNotificationPreferenceCategory,
    {
      inAppEnabled?: boolean;
      pushEnabled?: boolean;
    }
  >();

  for (const preference of preferences) {
    const category = normalizeCommunicationNotificationPreferenceCategory(
      preference.category,
    );
    const normalized = {
      inAppEnabled: resolvePreferenceBoolean({
        camelValue: preference.inAppEnabled,
        snakeValue: preference.in_app_enabled,
        fieldName: 'inAppEnabled',
      }),
      pushEnabled: resolvePreferenceBoolean({
        camelValue: preference.pushEnabled,
        snakeValue: preference.push_enabled,
        fieldName: 'pushEnabled',
      }),
    };
    assertPreferenceUpdateHasAtLeastOneChannel(normalized);

    const current = byCategory.get(category) ?? {};
    byCategory.set(category, {
      ...current,
      ...(typeof normalized.inAppEnabled !== 'undefined'
        ? { inAppEnabled: normalized.inAppEnabled }
        : {}),
      ...(typeof normalized.pushEnabled !== 'undefined'
        ? { pushEnabled: normalized.pushEnabled }
        : {}),
    });
  }

  return [...byCategory.entries()].map(([category, preference]) => ({
    category,
    ...preference,
  }));
}

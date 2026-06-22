import { CommunicationNotificationPreferenceCategory } from '@prisma/client';
import { CommunicationAppNotificationAliasStyle } from './communication-app-notification.presenter';
import {
  presentCommunicationNotificationPreferenceCategory,
  CommunicationNotificationPreferenceCategoryPublic,
} from '../domain/communication-notification-preference-domain';
import { CommunicationNotificationPreferenceRecord } from '../infrastructure/communication-notification-preference.repository';

export interface CommunicationNotificationPreferenceView {
  category: CommunicationNotificationPreferenceCategory;
  inAppEnabled: boolean;
  pushEnabled: boolean;
}

interface PreferenceMetadata {
  category: CommunicationNotificationPreferenceCategory;
  label: string;
  description: string;
}

const PREFERENCE_METADATA: PreferenceMetadata[] = [
  {
    category: CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
    label: 'Messages',
    description: 'Notifications for new communication messages.',
  },
  {
    category: CommunicationNotificationPreferenceCategory.ANNOUNCEMENT,
    label: 'Announcements',
    description: 'Notifications for school and class announcements.',
  },
];

export function buildDefaultedCommunicationNotificationPreferences(
  records: CommunicationNotificationPreferenceRecord[],
): CommunicationNotificationPreferenceView[] {
  const byCategory = new Map(
    records.map((record) => [
      record.category,
      {
        inAppEnabled: record.inAppEnabled,
        pushEnabled: record.pushEnabled,
      },
    ]),
  );

  return PREFERENCE_METADATA.map((metadata) => ({
    category: metadata.category,
    inAppEnabled: byCategory.get(metadata.category)?.inAppEnabled ?? true,
    pushEnabled: byCategory.get(metadata.category)?.pushEnabled ?? true,
  }));
}

export function presentCommunicationNotificationPreferences(params: {
  preferences: CommunicationNotificationPreferenceView[];
  aliasStyle: CommunicationAppNotificationAliasStyle;
}) {
  return {
    preferences: params.preferences.map((preference) =>
      presentCommunicationNotificationPreference(preference, params.aliasStyle),
    ),
  };
}

function presentCommunicationNotificationPreference(
  preference: CommunicationNotificationPreferenceView,
  aliasStyle: CommunicationAppNotificationAliasStyle,
) {
  const metadata = PREFERENCE_METADATA.find(
    (item) => item.category === preference.category,
  );
  const category = presentCommunicationNotificationPreferenceCategory(
    preference.category,
  );
  const base = {
    category,
    label: metadata?.label ?? buildFallbackLabel(category),
    description: metadata?.description ?? '',
    inAppEnabled: preference.inAppEnabled,
    pushEnabled: preference.pushEnabled,
    canChange: true,
  };

  if (aliasStyle !== 'dual') return base;

  return {
    ...base,
    in_app_enabled: preference.inAppEnabled,
    push_enabled: preference.pushEnabled,
    can_change: true,
  };
}

function buildFallbackLabel(
  category: CommunicationNotificationPreferenceCategoryPublic,
): string {
  return category
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

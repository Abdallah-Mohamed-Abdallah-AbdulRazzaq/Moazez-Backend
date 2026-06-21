import { HttpStatus } from '@nestjs/common';
import { CommunicationNotificationPreferenceCategory } from '@prisma/client';
import { DomainException } from '../../../common/exceptions/domain-exception';

export const COMMUNICATION_NOTIFICATION_PREFERENCE_CATEGORIES = [
  'message_received',
  'announcement',
] as const;

export type CommunicationNotificationPreferenceCategoryPublic =
  (typeof COMMUNICATION_NOTIFICATION_PREFERENCE_CATEGORIES)[number];

const NOTIFICATION_PREFERENCE_CATEGORY_MAP: Record<
  string,
  CommunicationNotificationPreferenceCategory
> = {
  message_received: CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
  announcement: CommunicationNotificationPreferenceCategory.ANNOUNCEMENT,
};

export class CommunicationNotificationPreferenceInvalidException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'communication.notification_preference.invalid',
      message,
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export function normalizeCommunicationNotificationPreferenceCategory(
  value: string,
): CommunicationNotificationPreferenceCategory {
  const normalized = value.trim().toLowerCase();
  const mapped = NOTIFICATION_PREFERENCE_CATEGORY_MAP[normalized];
  if (!mapped) {
    throw new CommunicationNotificationPreferenceInvalidException(
      'Notification preference category is invalid',
      { field: 'category', value },
    );
  }

  return mapped;
}

export function presentCommunicationNotificationPreferenceCategory(
  value: CommunicationNotificationPreferenceCategory,
): CommunicationNotificationPreferenceCategoryPublic {
  switch (value) {
    case CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED:
      return 'message_received';
    case CommunicationNotificationPreferenceCategory.ANNOUNCEMENT:
      return 'announcement';
  }
}

export function resolvePreferenceBoolean(input: {
  inAppEnabled?: boolean;
  in_app_enabled?: boolean;
}): boolean {
  const hasCamel = typeof input.inAppEnabled !== 'undefined';
  const hasSnake = typeof input.in_app_enabled !== 'undefined';

  if (!hasCamel && !hasSnake) {
    throw new CommunicationNotificationPreferenceInvalidException(
      'Notification preference inAppEnabled is required',
      { field: 'inAppEnabled' },
    );
  }

  if (
    hasCamel &&
    hasSnake &&
    input.inAppEnabled !== input.in_app_enabled
  ) {
    throw new CommunicationNotificationPreferenceInvalidException(
      'Notification preference aliases must not conflict',
      { field: 'inAppEnabled' },
    );
  }

  const value = hasCamel ? input.inAppEnabled : input.in_app_enabled;
  if (typeof value !== 'boolean') {
    throw new CommunicationNotificationPreferenceInvalidException(
      'Notification preference inAppEnabled must be a boolean',
      { field: 'inAppEnabled' },
    );
  }

  return value;
}

import { HttpStatus } from '@nestjs/common';
import { CommunicationNotificationPreferenceCategory } from '@prisma/client';
import { DomainException } from '../../../common/exceptions/domain-exception';

export const COMMUNICATION_NOTIFICATION_PREFERENCE_CATEGORIES = [
  'message_received',
  'announcement',
  'attendance',
] as const;

export type CommunicationNotificationPreferenceCategoryPublic =
  (typeof COMMUNICATION_NOTIFICATION_PREFERENCE_CATEGORIES)[number];

const NOTIFICATION_PREFERENCE_CATEGORY_MAP: Record<
  string,
  CommunicationNotificationPreferenceCategory
> = {
  message_received: CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
  announcement: CommunicationNotificationPreferenceCategory.ANNOUNCEMENT,
  attendance: CommunicationNotificationPreferenceCategory.ATTENDANCE,
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
    case CommunicationNotificationPreferenceCategory.ATTENDANCE:
      return 'attendance';
  }
}

export function resolvePreferenceBoolean(input: {
  camelValue?: boolean;
  snakeValue?: boolean;
  fieldName: string;
}): boolean | undefined {
  const hasCamel = typeof input.camelValue !== 'undefined';
  const hasSnake = typeof input.snakeValue !== 'undefined';

  if (!hasCamel && !hasSnake) {
    return undefined;
  }

  if (
    hasCamel &&
    hasSnake &&
    input.camelValue !== input.snakeValue
  ) {
    throw new CommunicationNotificationPreferenceInvalidException(
      'Notification preference aliases must not conflict',
      { field: input.fieldName },
    );
  }

  const value = hasCamel ? input.camelValue : input.snakeValue;
  if (typeof value !== 'boolean') {
    throw new CommunicationNotificationPreferenceInvalidException(
      `Notification preference ${input.fieldName} must be a boolean`,
      { field: input.fieldName },
    );
  }

  return value;
}

export function assertPreferenceUpdateHasAtLeastOneChannel(input: {
  inAppEnabled?: boolean;
  pushEnabled?: boolean;
}): void {
  if (
    typeof input.inAppEnabled !== 'undefined' ||
    typeof input.pushEnabled !== 'undefined'
  ) {
    return;
  }

  throw new CommunicationNotificationPreferenceInvalidException(
    'Notification preference update must include inAppEnabled or pushEnabled',
    { field: 'preferences' },
  );
}

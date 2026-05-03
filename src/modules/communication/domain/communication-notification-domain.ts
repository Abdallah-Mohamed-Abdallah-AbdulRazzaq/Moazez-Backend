import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export type CommunicationNotificationStatusValue =
  | 'UNREAD'
  | 'READ'
  | 'ARCHIVED';

export type CommunicationNotificationPriorityValue =
  | 'LOW'
  | 'NORMAL'
  | 'HIGH'
  | 'URGENT';

export type CommunicationNotificationSourceModuleValue =
  | 'COMMUNICATION'
  | 'ANNOUNCEMENTS'
  | 'ATTENDANCE'
  | 'GRADES'
  | 'BEHAVIOR'
  | 'REINFORCEMENT'
  | 'ADMISSIONS'
  | 'STUDENTS'
  | 'SYSTEM';

export type CommunicationNotificationTypeValue =
  | 'ANNOUNCEMENT_PUBLISHED'
  | 'MESSAGE_RECEIVED'
  | 'MESSAGE_MENTION'
  | 'ATTENDANCE_ABSENCE'
  | 'ATTENDANCE_LATE'
  | 'GRADE_POSTED'
  | 'BEHAVIOR_RECORD_CREATED'
  | 'REINFORCEMENT_REWARD_GRANTED'
  | 'SYSTEM_ALERT';

export type CommunicationNotificationDeliveryChannelValue =
  | 'IN_APP'
  | 'EMAIL'
  | 'SMS'
  | 'PUSH';

export type CommunicationNotificationDeliveryStatusValue =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'SKIPPED';

export interface PlainCommunicationNotification {
  id: string;
  recipientUserId: string;
  status: CommunicationNotificationStatusValue;
  readAt?: Date | null;
  archivedAt?: Date | null;
  expiresAt?: Date | null;
}

const NOTIFICATION_STATUS_MAP: Record<
  string,
  CommunicationNotificationStatusValue
> = {
  unread: 'UNREAD',
  read: 'READ',
  archived: 'ARCHIVED',
};

const NOTIFICATION_PRIORITY_MAP: Record<
  string,
  CommunicationNotificationPriorityValue
> = {
  low: 'LOW',
  normal: 'NORMAL',
  high: 'HIGH',
  urgent: 'URGENT',
};

const NOTIFICATION_SOURCE_MODULE_MAP: Record<
  string,
  CommunicationNotificationSourceModuleValue
> = {
  communication: 'COMMUNICATION',
  announcements: 'ANNOUNCEMENTS',
  attendance: 'ATTENDANCE',
  grades: 'GRADES',
  behavior: 'BEHAVIOR',
  reinforcement: 'REINFORCEMENT',
  admissions: 'ADMISSIONS',
  students: 'STUDENTS',
  system: 'SYSTEM',
};

const NOTIFICATION_TYPE_MAP: Record<string, CommunicationNotificationTypeValue> =
  {
    announcement_published: 'ANNOUNCEMENT_PUBLISHED',
    message_received: 'MESSAGE_RECEIVED',
    message_mention: 'MESSAGE_MENTION',
    attendance_absence: 'ATTENDANCE_ABSENCE',
    attendance_late: 'ATTENDANCE_LATE',
    grade_posted: 'GRADE_POSTED',
    behavior_record_created: 'BEHAVIOR_RECORD_CREATED',
    reinforcement_reward_granted: 'REINFORCEMENT_REWARD_GRANTED',
    system_alert: 'SYSTEM_ALERT',
  };

const NOTIFICATION_DELIVERY_CHANNEL_MAP: Record<
  string,
  CommunicationNotificationDeliveryChannelValue
> = {
  in_app: 'IN_APP',
  email: 'EMAIL',
  sms: 'SMS',
  push: 'PUSH',
};

const NOTIFICATION_DELIVERY_STATUS_MAP: Record<
  string,
  CommunicationNotificationDeliveryStatusValue
> = {
  pending: 'PENDING',
  sent: 'SENT',
  delivered: 'DELIVERED',
  failed: 'FAILED',
  skipped: 'SKIPPED',
};

export class CommunicationNotificationInvalidException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'communication.scope.invalid',
      message,
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class CommunicationNotificationForbiddenException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'communication.scope.invalid',
      message,
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class CommunicationNotificationStateException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'communication.scope.invalid',
      message,
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function normalizeCommunicationNotificationStatus(
  value: string,
): CommunicationNotificationStatusValue {
  return normalizeNotificationEnum(
    value,
    NOTIFICATION_STATUS_MAP,
    'Notification status is invalid',
    'status',
  );
}

export function normalizeCommunicationNotificationPriority(
  value: string,
): CommunicationNotificationPriorityValue {
  return normalizeNotificationEnum(
    value,
    NOTIFICATION_PRIORITY_MAP,
    'Notification priority is invalid',
    'priority',
  );
}

export function normalizeCommunicationNotificationSourceModule(
  value: string,
): CommunicationNotificationSourceModuleValue {
  return normalizeNotificationEnum(
    value,
    NOTIFICATION_SOURCE_MODULE_MAP,
    'Notification source module is invalid',
    'sourceModule',
  );
}

export function normalizeCommunicationNotificationType(
  value: string,
): CommunicationNotificationTypeValue {
  return normalizeNotificationEnum(
    value,
    NOTIFICATION_TYPE_MAP,
    'Notification type is invalid',
    'type',
  );
}

export function normalizeCommunicationNotificationDeliveryChannel(
  value: string,
): CommunicationNotificationDeliveryChannelValue {
  return normalizeNotificationEnum(
    value,
    NOTIFICATION_DELIVERY_CHANNEL_MAP,
    'Notification delivery channel is invalid',
    'channel',
  );
}

export function normalizeCommunicationNotificationDeliveryStatus(
  value: string,
): CommunicationNotificationDeliveryStatusValue {
  return normalizeNotificationEnum(
    value,
    NOTIFICATION_DELIVERY_STATUS_MAP,
    'Notification delivery status is invalid',
    'status',
  );
}

export function assertCanViewNotification(params: {
  actorId: string;
  hasManagePermission: boolean;
  notification: Pick<PlainCommunicationNotification, 'id' | 'recipientUserId'>;
}): void {
  if (params.hasManagePermission) return;
  assertNotificationRecipient({
    actorId: params.actorId,
    notification: params.notification,
    action: 'view',
  });
}

export function assertCanMarkNotificationRead(params: {
  actorId: string;
  notification: PlainCommunicationNotification;
}): void {
  assertNotificationRecipient({
    actorId: params.actorId,
    notification: params.notification,
    action: 'mark read',
  });
  assertNotificationIsMutableForReadState(params.notification);
}

export function assertCanArchiveNotification(params: {
  actorId: string;
  notification: PlainCommunicationNotification;
}): void {
  assertNotificationRecipient({
    actorId: params.actorId,
    notification: params.notification,
    action: 'archive',
  });
}

export function assertCanViewDelivery(params: {
  hasManagePermission: boolean;
}): void {
  if (params.hasManagePermission) return;
  throw new CommunicationNotificationForbiddenException(
    'Notification delivery records require manage permission',
  );
}

export function assertNotificationIsMutableForReadState(
  notification: PlainCommunicationNotification,
): void {
  if (notification.status === 'ARCHIVED') {
    throw new CommunicationNotificationStateException(
      'Archived notifications cannot be marked read',
      { notificationId: notification.id, status: notification.status },
    );
  }
}

function assertNotificationRecipient(params: {
  actorId: string;
  notification: Pick<PlainCommunicationNotification, 'id' | 'recipientUserId'>;
  action: string;
}): void {
  if (params.notification.recipientUserId === params.actorId) return;

  throw new CommunicationNotificationForbiddenException(
    `Only the notification recipient can ${params.action} this notification`,
    { notificationId: params.notification.id },
  );
}

function normalizeNotificationEnum<T extends string>(
  value: string,
  map: Record<string, T>,
  message: string,
  field: string,
): T {
  const normalized = value.trim().toLowerCase();
  const mapped = map[normalized];
  if (!mapped) {
    throw new CommunicationNotificationInvalidException(message, {
      field,
      value,
    });
  }

  return mapped;
}

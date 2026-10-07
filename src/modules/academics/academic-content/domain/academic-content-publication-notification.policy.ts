import {
  AcademicContentAudienceRecipientKind as Kind,
  AcademicContentAudienceType as Audience,
  AcademicContentType as Type,
  AcademicContentChangeSignificance as Significance,
  UserStatus,
  UserType,
  Prisma,
} from '@prisma/client';
import { AcademicContentEffectiveNotificationPolicy } from './academic-content-notification.policy';
import { decodeAcademicContentRevisionSnapshotV2 } from './academic-content-revision-snapshot';
import {
  COMMUNICATION_NOTIFICATION_RECONCILE_INTERVAL_MS,
  COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS,
} from '../../../communication/domain/communication-notification-generation-domain';

export const ACADEMIC_CONTENT_REMINDER_STALE_GRACE_MS =
  COMMUNICATION_NOTIFICATION_RECONCILE_INTERVAL_MS;

export function academicContentNotificationDueAt(source: {
  publishedAt: Date;
  visibleFrom: Date;
}): Date {
  return new Date(
    Math.max(source.publishedAt.getTime(), source.visibleFrom.getTime()),
  );
}

export function academicContentWasVisibleBeforeCancellation(source: {
  publishedAt: Date | null;
  visibleFrom: Date;
  cancelledAt: Date | null;
}): boolean {
  return (
    source.publishedAt !== null &&
    source.cancelledAt !== null &&
    source.cancelledAt >=
      academicContentNotificationDueAt({
        ...source,
        publishedAt: source.publishedAt,
      })
  );
}

export function academicContentSessionStartAt(
  snapshot: Prisma.JsonValue,
  type: Type,
): Date | null {
  if (type !== Type.ONLINE_SESSION) return null;
  try {
    const decoded = decodeAcademicContentRevisionSnapshotV2(snapshot, type);
    return decoded.type === Type.ONLINE_SESSION
      ? new Date(decoded.state.startAt)
      : null;
  } catch {
    return null;
  }
}

export function academicContentReminderAt(input: {
  startAt: Date;
  publishedAt: Date;
  visibleFrom: Date;
  offsetMinutes: number;
  now: Date;
  phase: 'publication' | 'recovery' | 'worker';
}): Date | null {
  const at = new Date(input.startAt.getTime() - input.offsetMinutes * 60_000);
  if (
    !Number.isFinite(at.getTime()) ||
    at <= input.publishedAt ||
    at < input.visibleFrom ||
    input.startAt <= input.now
  )
    return null;
  if (input.phase === 'publication') return at > input.now ? at : null;
  if (
    input.now.getTime() >=
    at.getTime() + ACADEMIC_CONTENT_REMINDER_STALE_GRACE_MS
  )
    return null;
  if (input.phase === 'worker') return at <= input.now ? at : null;
  return at.getTime() <=
    input.now.getTime() + COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS
    ? at
    : null;
}

export const ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE = 500;
export const ACADEMIC_CONTENT_NOTIFICATION_CONTEXT_PAGE_SIZE = 500;
export const ACADEMIC_CONTENT_NOTIFICATION_RECOVERY_PAGE_SIZE = 100;

/** Decision from persisted publication lineage only, independent of policy/delivery. */
export function academicContentPublicationNotificationEvent(source: {
  supersedesPublicationId: string | null;
  changeSignificance: Significance | null;
  notifyMinorUpdate: boolean;
}): 'academic_content_published' | 'academic_content_updated' | null {
  if (source.supersedesPublicationId === null)
    return source.changeSignificance === null && !source.notifyMinorUpdate
      ? 'academic_content_published'
      : null;
  if (
    source.changeSignificance === Significance.SIGNIFICANT ||
    (source.changeSignificance === Significance.MINOR &&
      source.notifyMinorUpdate)
  )
    return 'academic_content_updated';
  return null;
}

export function publishedNotificationPolicyAllows(
  type: Type,
  policy: AcademicContentEffectiveNotificationPolicy,
): boolean {
  if (!policy.notificationsEnabled) return false;
  switch (type) {
    case Type.WEEKLY_PLAN:
      return policy.weeklyPlanNotificationsEnabled;
    case Type.GUARDIAN_WEEKLY_NOTE:
      return policy.guardianWeeklyNoteNotificationsEnabled;
    case Type.SUBJECT_RESOURCE:
      return policy.subjectResourceNotificationsEnabled;
    case Type.ONLINE_SESSION:
      return policy.onlineSessionNotificationsEnabled;
    case Type.GENERAL_RESOURCE:
      return policy.generalResourceNotificationsEnabled;
    case Type.TEACHER_PREPARATION:
      return false;
  }
}

export function publishedNotificationContextAllows(
  context: {
    recipientUserId: string | null;
    recipientKind: Kind;
    guardianCanReceiveNotifications: boolean | null;
  },
  user:
    | { status: UserStatus; deletedAt: Date | null; userType: UserType }
    | undefined,
  policy: AcademicContentEffectiveNotificationPolicy,
  audience: Audience,
): boolean {
  if (
    !context.recipientUserId ||
    !user ||
    user.status !== UserStatus.ACTIVE ||
    user.deletedAt !== null ||
    audience === Audience.INTERNAL_STAFF
  )
    return false;
  if (context.recipientKind === Kind.STUDENT)
    return (
      policy.studentNotificationsEnabled &&
      audience !== Audience.GUARDIANS &&
      user.userType === UserType.STUDENT
    );
  return (
    policy.guardianNotificationsEnabled &&
    audience !== Audience.STUDENTS &&
    context.guardianCanReceiveNotifications !== false &&
    user.userType === UserType.PARENT
  );
}

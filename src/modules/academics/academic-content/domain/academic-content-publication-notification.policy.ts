import {
  AcademicContentAudienceRecipientKind as Kind,
  AcademicContentAudienceType as Audience,
  AcademicContentType as Type,
  UserStatus,
  UserType,
} from '@prisma/client';
import { AcademicContentEffectiveNotificationPolicy } from './academic-content-notification.policy';

export const ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE = 500;
export const ACADEMIC_CONTENT_NOTIFICATION_CONTEXT_PAGE_SIZE = 500;
export const ACADEMIC_CONTENT_NOTIFICATION_RECOVERY_PAGE_SIZE = 100;

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

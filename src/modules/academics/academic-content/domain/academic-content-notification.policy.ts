import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export interface AcademicContentEffectiveNotificationPolicy {
  notificationsEnabled: boolean;
  studentNotificationsEnabled: boolean;
  guardianNotificationsEnabled: boolean;
  weeklyPlanNotificationsEnabled: boolean;
  guardianWeeklyNoteNotificationsEnabled: boolean;
  subjectResourceNotificationsEnabled: boolean;
  onlineSessionNotificationsEnabled: boolean;
  generalResourceNotificationsEnabled: boolean;
  significantUpdateNotificationsEnabled: boolean;
  cancellationNotificationsEnabled: boolean;
  onlineSessionRemindersEnabled: boolean;
  onlineSessionReminderOffsetsMinutes: number[];
}

export type AcademicContentNotificationPolicyPatch =
  Partial<AcademicContentEffectiveNotificationPolicy>;

export const ACADEMIC_CONTENT_NOTIFICATION_BOOLEAN_FIELDS = [
  'notificationsEnabled',
  'studentNotificationsEnabled',
  'guardianNotificationsEnabled',
  'weeklyPlanNotificationsEnabled',
  'guardianWeeklyNoteNotificationsEnabled',
  'subjectResourceNotificationsEnabled',
  'onlineSessionNotificationsEnabled',
  'generalResourceNotificationsEnabled',
  'significantUpdateNotificationsEnabled',
  'cancellationNotificationsEnabled',
  'onlineSessionRemindersEnabled',
] as const;

export const ACADEMIC_CONTENT_REMINDER_MAX_OFFSETS = 5;
export const ACADEMIC_CONTENT_REMINDER_MIN_MINUTES = 5;
export const ACADEMIC_CONTENT_REMINDER_MAX_MINUTES = 10080;

export function normalizeAcademicContentReminderOffsets(
  value: unknown,
): number[] {
  if (
    !Array.isArray(value) ||
    value.length > ACADEMIC_CONTENT_REMINDER_MAX_OFFSETS ||
    Array.from(value).some(
      (offset) =>
        !Number.isInteger(offset) ||
        offset < ACADEMIC_CONTENT_REMINDER_MIN_MINUTES ||
        offset > ACADEMIC_CONTENT_REMINDER_MAX_MINUTES,
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new ValidationDomainException(
      'Invalid Academic Content reminder offsets',
    );
  }
  return [...(value as number[])].sort((a, b) => a - b);
}

export function normalizeAcademicContentNotificationPolicyPatch(
  value: unknown,
): AcademicContentNotificationPolicyPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationDomainException(
      'Invalid Academic Content notification policy',
    );
  }
  const fields = value as Record<string, unknown>;
  const allowed: readonly string[] = [
    ...ACADEMIC_CONTENT_NOTIFICATION_BOOLEAN_FIELDS,
    'onlineSessionReminderOffsetsMinutes',
  ];
  if (Object.keys(fields).some((field) => !allowed.includes(field))) {
    throw new ValidationDomainException(
      'Invalid Academic Content notification policy field',
    );
  }
  const patch: AcademicContentNotificationPolicyPatch = {};
  for (const field of ACADEMIC_CONTENT_NOTIFICATION_BOOLEAN_FIELDS) {
    if (fields[field] === undefined) continue;
    if (typeof fields[field] !== 'boolean') {
      throw new ValidationDomainException(
        'Academic Content notification policy flags must be boolean',
      );
    }
    patch[field] = fields[field];
  }
  if (fields.onlineSessionReminderOffsetsMinutes !== undefined) {
    patch.onlineSessionReminderOffsetsMinutes =
      normalizeAcademicContentReminderOffsets(
        fields.onlineSessionReminderOffsetsMinutes,
      );
  }
  if (Object.keys(patch).length === 0) {
    throw new ValidationDomainException(
      'Academic Content notification policy patch must not be empty',
    );
  }
  return patch;
}

// Explicit allowlist also keeps persistence identity and timestamps out of responses/audits.
export function effectiveAcademicContentNotificationPolicy(
  row?: Partial<AcademicContentEffectiveNotificationPolicy> | null,
): AcademicContentEffectiveNotificationPolicy {
  return {
    notificationsEnabled: row?.notificationsEnabled ?? true,
    studentNotificationsEnabled: row?.studentNotificationsEnabled ?? true,
    guardianNotificationsEnabled: row?.guardianNotificationsEnabled ?? true,
    weeklyPlanNotificationsEnabled: row?.weeklyPlanNotificationsEnabled ?? true,
    guardianWeeklyNoteNotificationsEnabled:
      row?.guardianWeeklyNoteNotificationsEnabled ?? true,
    subjectResourceNotificationsEnabled:
      row?.subjectResourceNotificationsEnabled ?? true,
    onlineSessionNotificationsEnabled:
      row?.onlineSessionNotificationsEnabled ?? true,
    generalResourceNotificationsEnabled:
      row?.generalResourceNotificationsEnabled ?? true,
    significantUpdateNotificationsEnabled:
      row?.significantUpdateNotificationsEnabled ?? true,
    cancellationNotificationsEnabled:
      row?.cancellationNotificationsEnabled ?? true,
    onlineSessionRemindersEnabled: row?.onlineSessionRemindersEnabled ?? false,
    onlineSessionReminderOffsetsMinutes:
      normalizeAcademicContentReminderOffsets(
        row?.onlineSessionReminderOffsetsMinutes ?? [],
      ),
  };
}

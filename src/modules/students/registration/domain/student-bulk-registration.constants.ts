export const STUDENT_BULK_REGISTRATION_TEMPLATE_VERSION = 1 as const;

export const STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS = [
  'first_name_en',
  'father_name_en',
  'grandfather_name_en',
  'family_name_en',
  'first_name_ar',
  'father_name_ar',
  'grandfather_name_ar',
  'family_name_ar',
  'date_of_birth',
  'gender',
  'nationality',
  'username',
  'contact_email',
  'student_phone',
] as const;

export const STUDENT_BULK_REGISTRATION_TEMPLATE_CSV = `\uFEFF${STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.join(',')}\r\n`;

export const STUDENT_BULK_REGISTRATION_TEMPLATE_FILENAME =
  'student-bulk-registration-v1.csv';

export const STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_MS =
  24 * 60 * 60 * 1000;

export const STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_PAGE_SIZE = 100;

export const STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_EXPIRED_CODE =
  'students.bulk_registration.execution_recovery_window_expired';

export const STUDENT_BULK_REGISTRATION_EXECUTION_TENANT_INELIGIBLE_CODE =
  'students.bulk_registration.execution_tenant_ineligible';

import { STUDENT_CREDENTIAL_EXPORT_MAX_BYTES } from './student-credential.constants';
import { StudentCredentialExportTooLargeException } from './student-credential.exceptions';

export const STUDENT_CREDENTIAL_EXPORT_HEADERS = [
  'student_id',
  'student_name',
  'username',
  'login_email',
  'temporary_password',
  'credential_status',
  'must_change_password',
  'generated_at',
] as const;

export type StudentCredentialExportStatus =
  | 'temporary_credential'
  | 'credential_changed'
  | 'account_ineligible';

export interface StudentCredentialExportCsvRow {
  studentId: string;
  studentName: string;
  username: string;
  loginEmail: string;
  temporaryPassword: string;
  credentialStatus: StudentCredentialExportStatus;
  mustChangePassword: string;
  generatedAt: string;
}

export function renderStudentCredentialExportCsv(
  rows: readonly StudentCredentialExportCsvRow[],
  maxBytes = STUDENT_CREDENTIAL_EXPORT_MAX_BYTES,
): Buffer {
  const chunks: string[] = ['\uFEFF'];
  let byteLength = Buffer.byteLength(chunks[0], 'utf8');
  const append = (values: readonly string[]): void => {
    const line = `${values.map(encodeCsvCell).join(',')}\r\n`;
    byteLength += Buffer.byteLength(line, 'utf8');
    if (byteLength > maxBytes) {
      throw new StudentCredentialExportTooLargeException();
    }
    chunks.push(line);
  };

  append(STUDENT_CREDENTIAL_EXPORT_HEADERS);
  for (const row of rows) {
    append([
      row.studentId,
      row.studentName,
      row.username,
      row.loginEmail,
      row.temporaryPassword,
      row.credentialStatus,
      row.mustChangePassword,
      row.generatedAt,
    ]);
  }
  return Buffer.from(chunks.join(''), 'utf8');
}

export function neutralizeSpreadsheetFormula(value: string): string {
  return /^[=+\-@\t\r\n]/u.test(value) || /^[ \t\r\n]+[=+\-@]/u.test(value)
    ? `'${value}`
    : value;
}

function encodeCsvCell(value: string): string {
  return `"${neutralizeSpreadsheetFormula(value).replaceAll('"', '""')}"`;
}

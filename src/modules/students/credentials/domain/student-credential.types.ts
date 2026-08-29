import {
  StudentCredentialAudienceMode,
  StudentCredentialMode,
} from '@prisma/client';

export const STUDENT_CREDENTIAL_AUDIENCE_API_VALUES = [
  'import_batch',
  'selected_students',
  'academic_year',
  'stage',
  'grade',
  'section',
  'classroom',
  'missing_password',
] as const;

export type StudentCredentialAudienceApiValue =
  (typeof STUDENT_CREDENTIAL_AUDIENCE_API_VALUES)[number];

export const STUDENT_CREDENTIAL_MODE_API_VALUES = [
  'unique_generated',
  'shared_temporary',
] as const;

export type StudentCredentialModeApiValue =
  (typeof STUDENT_CREDENTIAL_MODE_API_VALUES)[number];

export interface StudentCredentialAudienceCommand {
  audienceMode: unknown;
  sourceRegistrationBatchId?: unknown;
  studentIds?: unknown;
  academicYearId?: unknown;
  stageId?: unknown;
  gradeId?: unknown;
  sectionId?: unknown;
  classroomId?: unknown;
}

export interface CreateStudentCredentialBatchCommand extends StudentCredentialAudienceCommand {
  credentialMode: unknown;
}

export interface StudentCredentialAudienceSelection {
  audienceMode: StudentCredentialAudienceMode;
  sourceRegistrationBatchId: string | null;
  studentIds: string[];
  academicYearId: string | null;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
}

export interface StudentCredentialArtifactEntry {
  rowId: string;
  studentId: string;
  userId: string;
  temporaryPassword: string;
}

export interface StudentCredentialSecretArtifact {
  version: 1;
  batchId: string;
  credentialMode: StudentCredentialModeApiValue;
  createdAt: string;
  entries: StudentCredentialArtifactEntry[];
}

export function mapStudentCredentialAudienceToApi(
  value: StudentCredentialAudienceMode,
): StudentCredentialAudienceApiValue {
  return value.toLowerCase() as StudentCredentialAudienceApiValue;
}

export function mapStudentCredentialModeToApi(
  value: StudentCredentialMode,
): StudentCredentialModeApiValue {
  return value.toLowerCase() as StudentCredentialModeApiValue;
}

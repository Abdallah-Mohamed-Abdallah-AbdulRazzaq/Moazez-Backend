import {
  StudentCredentialAudienceMode,
  StudentCredentialMode,
} from '@prisma/client';
import { CredentialPasswordPolicyFailedException } from '../../../settings/users/credentials/domain/credential.exceptions';
import { validateAdminProvidedPassword } from '../../../settings/users/credentials/domain/credential-password.policy';
import { StudentCredentialAudienceInvalidException } from './student-credential.exceptions';
import {
  type CreateStudentCredentialBatchCommand,
  type StudentCredentialAudienceApiValue,
  type StudentCredentialAudienceCommand,
  type StudentCredentialAudienceSelection,
  type StudentCredentialModeSelection,
  type StudentCredentialModeApiValue,
} from './student-credential.types';
import { STUDENT_CREDENTIAL_SELECTED_STUDENTS_MAX } from './student-credential.constants';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const SELECTOR_FIELDS = [
  'sourceRegistrationBatchId',
  'studentIds',
  'academicYearId',
  'stageId',
  'gradeId',
  'sectionId',
  'classroomId',
] as const;

export function parseStudentCredentialAudience(
  command: StudentCredentialAudienceCommand,
): StudentCredentialAudienceSelection {
  const audienceMode = parseAudienceMode(command.audienceMode);
  const allowedFields = allowedSelectorFields(audienceMode);

  for (const field of SELECTOR_FIELDS) {
    if (!allowedFields.includes(field) && command[field] !== undefined) {
      throw new StudentCredentialAudienceInvalidException(
        'selector_combination_invalid',
      );
    }
  }

  const selection: StudentCredentialAudienceSelection = {
    audienceMode: mapAudienceModeFromApi(audienceMode),
    sourceRegistrationBatchId: null,
    studentIds: [],
    academicYearId: null,
    stageId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
  };

  switch (audienceMode) {
    case 'import_batch':
      selection.sourceRegistrationBatchId = requireUuid(
        command.sourceRegistrationBatchId,
        'source_registration_batch_required',
      );
      break;
    case 'selected_students':
      selection.studentIds = requireStudentIds(command.studentIds);
      break;
    case 'academic_year':
      selection.academicYearId = requireUuid(
        command.academicYearId,
        'academic_year_required',
      );
      break;
    case 'stage':
      selection.academicYearId = requireUuid(
        command.academicYearId,
        'academic_year_required',
      );
      selection.stageId = requireUuid(command.stageId, 'stage_required');
      break;
    case 'grade':
      selection.academicYearId = requireUuid(
        command.academicYearId,
        'academic_year_required',
      );
      selection.gradeId = requireUuid(command.gradeId, 'grade_required');
      break;
    case 'section':
      selection.academicYearId = requireUuid(
        command.academicYearId,
        'academic_year_required',
      );
      selection.sectionId = requireUuid(command.sectionId, 'section_required');
      break;
    case 'classroom':
      selection.academicYearId = requireUuid(
        command.academicYearId,
        'academic_year_required',
      );
      selection.classroomId = requireUuid(
        command.classroomId,
        'classroom_required',
      );
      break;
    case 'missing_password':
      break;
  }

  return selection;
}

export function parseStudentCredentialMode(
  command: CreateStudentCredentialBatchCommand,
): StudentCredentialMode {
  return parseStudentCredentialModeSelection(command).credentialMode;
}

export function parseStudentCredentialModeSelection(
  command: CreateStudentCredentialBatchCommand,
): StudentCredentialModeSelection {
  if (
    command.credentialMode !== 'unique_generated' &&
    command.credentialMode !== 'shared_temporary' &&
    command.credentialMode !== 'shared_admin_provided'
  ) {
    throw new StudentCredentialAudienceInvalidException(
      'credential_mode_invalid',
    );
  }

  const credentialMode = mapCredentialModeFromApi(command.credentialMode);
  if (credentialMode !== StudentCredentialMode.SHARED_ADMIN_PROVIDED) {
    if (command.sharedPassword !== undefined) {
      throw new StudentCredentialAudienceInvalidException(
        'shared_password_not_allowed',
      );
    }
    return { credentialMode, sharedPassword: null };
  }

  if (typeof command.sharedPassword !== 'string') {
    throw new CredentialPasswordPolicyFailedException(['password_required']);
  }
  const validation = validateAdminProvidedPassword(command.sharedPassword);
  if (!validation.valid) {
    throw new CredentialPasswordPolicyFailedException(validation.reasons);
  }
  return { credentialMode, sharedPassword: command.sharedPassword };
}

function parseAudienceMode(value: unknown): StudentCredentialAudienceApiValue {
  switch (value) {
    case 'import_batch':
    case 'selected_students':
    case 'academic_year':
    case 'stage':
    case 'grade':
    case 'section':
    case 'classroom':
    case 'missing_password':
      return value;
    default:
      throw new StudentCredentialAudienceInvalidException(
        'audience_mode_invalid',
      );
  }
}

function allowedSelectorFields(
  mode: StudentCredentialAudienceApiValue,
): Array<(typeof SELECTOR_FIELDS)[number]> {
  switch (mode) {
    case 'import_batch':
      return ['sourceRegistrationBatchId'];
    case 'selected_students':
      return ['studentIds'];
    case 'academic_year':
      return ['academicYearId'];
    case 'stage':
      return ['academicYearId', 'stageId'];
    case 'grade':
      return ['academicYearId', 'gradeId'];
    case 'section':
      return ['academicYearId', 'sectionId'];
    case 'classroom':
      return ['academicYearId', 'classroomId'];
    case 'missing_password':
      return [];
  }
}

function requireUuid(value: unknown, reasonCode: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new StudentCredentialAudienceInvalidException(reasonCode);
  }
  return value;
}

function requireStudentIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new StudentCredentialAudienceInvalidException('student_ids_required');
  }
  if (value.length > STUDENT_CREDENTIAL_SELECTED_STUDENTS_MAX) {
    throw new StudentCredentialAudienceInvalidException(
      'selected_students_limit_exceeded',
    );
  }
  const studentIds = value.filter(
    (item): item is string =>
      typeof item === 'string' && UUID_PATTERN.test(item),
  );
  if (studentIds.length !== value.length) {
    throw new StudentCredentialAudienceInvalidException('student_id_invalid');
  }
  if (new Set(studentIds).size !== studentIds.length) {
    throw new StudentCredentialAudienceInvalidException(
      'student_ids_duplicate',
    );
  }
  return [...studentIds];
}

function mapAudienceModeFromApi(
  value: StudentCredentialAudienceApiValue,
): StudentCredentialAudienceMode {
  return value.toUpperCase() as StudentCredentialAudienceMode;
}

function mapCredentialModeFromApi(
  value: StudentCredentialModeApiValue,
): StudentCredentialMode {
  return value.toUpperCase() as StudentCredentialMode;
}

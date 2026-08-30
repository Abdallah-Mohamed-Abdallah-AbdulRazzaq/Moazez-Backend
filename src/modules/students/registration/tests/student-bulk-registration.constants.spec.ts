import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  FILES_IMPORT_ALLOWED_TYPES,
  STUDENTS_BULK_REGISTRATION_IMPORT_TYPE,
} from '../../../files/imports/domain/import-upload.constraints';
import { normalizeImportJobType } from '../../../files/imports/validators/import-job.validator';
import {
  STUDENT_BULK_REGISTRATION_TEMPLATE_CSV,
  STUDENT_BULK_REGISTRATION_TEMPLATE_FILENAME,
  STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS,
  STUDENT_BULK_REGISTRATION_TEMPLATE_VERSION,
} from '../domain/student-bulk-registration.constants';

describe('student bulk registration intake constants', () => {
  it('defines the deterministic V1 header-only template contract', () => {
    expect(STUDENT_BULK_REGISTRATION_TEMPLATE_VERSION).toBe(1);
    expect(STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS).toEqual([
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
    ]);
    expect(STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS).toHaveLength(14);
    expect(new Set(STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS).size).toBe(
      STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.length,
    );
    expect(STUDENT_BULK_REGISTRATION_TEMPLATE_CSV).toBe(
      `\uFEFF${STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.join(',')}\r\n`,
    );
    expect(STUDENT_BULK_REGISTRATION_TEMPLATE_CSV.split('\r\n')).toEqual([
      `\uFEFF${STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.join(',')}`,
      '',
    ]);
    const templateBytes = Buffer.from(
      STUDENT_BULK_REGISTRATION_TEMPLATE_CSV,
      'utf8',
    );
    expect(templateBytes.subarray(0, 3)).toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    );
    expect(
      [...STUDENT_BULK_REGISTRATION_TEMPLATE_CSV].filter(
        (character) => character === '\uFEFF',
      ),
    ).toHaveLength(1);
    expect(STUDENT_BULK_REGISTRATION_TEMPLATE_FILENAME).toBe(
      'student-bulk-registration-v1.csv',
    );
    expect(STUDENT_BULK_REGISTRATION_TEMPLATE_CSV).not.toMatch(/password/iu);
    expect(STUDENT_BULK_REGISTRATION_TEMPLATE_CSV).not.toMatch(
      /(?:academic_year|term_id|stage_id|grade_id|section_id|classroom_id|enrollment_date)/u,
    );
  });

  it('keeps the bulk type internal to the student intake contract', () => {
    expect(STUDENTS_BULK_REGISTRATION_IMPORT_TYPE).toBe(
      'students_bulk_registration',
    );
    expect(FILES_IMPORT_ALLOWED_TYPES).toEqual(['students_basic']);
    expect(normalizeImportJobType('students_basic')).toBe('students_basic');
    expect(() =>
      normalizeImportJobType(STUDENTS_BULK_REGISTRATION_IMPORT_TYPE),
    ).toThrow(ValidationDomainException);
  });
});

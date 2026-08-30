import {
  SchoolLoginSettingsStatus,
  type SchoolLoginSettings,
} from '@prisma/client';
import {
  STUDENT_BULK_REGISTRATION_TEMPLATE_CSV,
  STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS,
} from '../domain/student-bulk-registration.constants';
import {
  collectCandidateLoginEmails,
  parseStudentBulkRegistrationCsv,
  STUDENT_BULK_REGISTRATION_ERROR_CODES,
  validateStudentBulkRegistrationIdentityRows,
} from '../domain/student-bulk-registration-csv';

describe('student bulk registration CSV contract', () => {
  const header = STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.join(',');
  const validRow = [
    'Sara',
    'Ali',
    '',
    'Hassan',
    '',
    '',
    '',
    '',
    '2012-05-20',
    'female',
    'Egyptian',
    'sara.hassan',
    'SARA@EXAMPLE.COM',
    '+201001234567',
  ];

  it.each(['\n', '\r\n'])(
    'parses the exact canonical header with %p',
    (eol) => {
      const result = parseStudentBulkRegistrationCsv(
        Buffer.from(`${header}${eol}${csvRow(validRow)}${eol}`),
      );
      expect(result.batchErrors).toEqual([]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].rowNumber).toBe(2);
    },
  );

  it('supports a UTF-8 BOM, quoted commas, escaped quotes, and quoted newlines', () => {
    const row = [...validRow];
    row[0] = 'Sara, Noor';
    row[1] = 'A "quoted"\nname';
    const result = parseStudentBulkRegistrationCsv(
      Buffer.from(`\uFEFF${header}\r\n${csvRow(row)}\r\n`),
    );
    expect(result.batchErrors).toEqual([]);
    expect(result.rows[0].normalizedData.firstNameEn).toBe('Sara, Noor');
    expect(result.rows[0].normalizedData.fatherNameEn).toBe('A "quoted" name');
  });

  it('round-trips the generated BOM template through the existing parser', () => {
    const result = parseStudentBulkRegistrationCsv(
      Buffer.from(
        `${STUDENT_BULK_REGISTRATION_TEMPLATE_CSV}${csvRow(validRow)}\r\n`,
        'utf8',
      ),
    );

    expect(result.batchErrors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      normalizedData: {
        firstNameEn: 'Sara',
        familyNameEn: 'Hassan',
        username: 'sara.hassan',
      },
    });
  });

  it.each([
    ['missing', STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.slice(0, -1)],
    ['extra', [...STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS, 'extra']],
    [
      'reordered',
      [
        STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS[1],
        STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS[0],
        ...STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.slice(2),
      ],
    ],
    [
      'duplicate',
      [
        STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS[0],
        STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS[0],
        ...STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.slice(2),
      ],
    ],
  ])('rejects a %s header as business validation', (_label, columns) => {
    const result = parseStudentBulkRegistrationCsv(
      Buffer.from(`${columns.join(',')}\n${csvRow(validRow)}\n`),
    );
    expect(result).toEqual({
      rows: [],
      batchErrors: [STUDENT_BULK_REGISTRATION_ERROR_CODES.invalidHeader],
    });
  });

  it('fails closed on malformed quoting', () => {
    expect(
      parseStudentBulkRegistrationCsv(
        Buffer.from(`${header}\n"unterminated,${validRow.slice(1).join(',')}`),
      ).batchErrors,
    ).toEqual([STUDENT_BULK_REGISTRATION_ERROR_CODES.malformedCsv]);
  });

  it('classifies a header-only source as a zero-row business failure', () => {
    expect(parseStudentBulkRegistrationCsv(Buffer.from(`${header}\n`))).toEqual(
      {
        rows: [],
        batchErrors: [STUDENT_BULK_REGISTRATION_ERROR_CODES.noDataRows],
      },
    );
  });

  it('normalizes whitespace, optional values, username, email, and hashes deterministically', () => {
    const row = [...validRow];
    row[0] = '  Sara   Noor  ';
    row[2] = '   ';
    row[11] = '  SARA.HASSAN  ';
    const csv = Buffer.from(`${header}\n${csvRow(row)}\n`);
    const first = parseStudentBulkRegistrationCsv(csv).rows[0];
    const second = parseStudentBulkRegistrationCsv(csv).rows[0];
    expect(first.normalizedData).toMatchObject({
      firstNameEn: 'Sara Noor',
      grandfatherNameEn: null,
      username: 'sara.hassan',
      contactEmail: 'sara@example.com',
    });
    expect(first.rowHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.rowHash).toBe(second.rowHash);
  });

  it('persists duplicate normalized rows and marks every occurrence invalid', () => {
    const result = parseStudentBulkRegistrationCsv(
      Buffer.from(`${header}\n${csvRow(validRow)}\n${csvRow(validRow)}\n`),
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.rowNumber)).toEqual([2, 3]);
    expect(
      result.rows.every((row) =>
        row.errors.some(
          (error) =>
            error.code === STUDENT_BULK_REGISTRATION_ERROR_CODES.duplicateRow,
        ),
      ),
    ).toBe(true);
  });

  it('accepts the current supported Arabic-name fallback', () => {
    const row = [...validRow];
    row[0] = '';
    row[3] = '';
    row[4] = 'سارة';
    row[7] = 'حسن';
    expect(
      parseStudentBulkRegistrationCsv(
        Buffer.from(`${header}\n${csvRow(row)}\n`),
      ).rows[0].errors,
    ).toEqual([]);
  });

  it.each([
    [8, '2012-02-31', 'dateOfBirth'],
    [12, 'not-an-email', 'contactEmail'],
    [13, 'not-a-phone', 'studentPhone'],
  ])(
    'marks invalid semantic field %s without crashing the parser',
    (index, value, field) => {
      const row = [...validRow];
      row[index] = value;
      const parsed = parseStudentBulkRegistrationCsv(
        Buffer.from(`${header}\n${csvRow(row)}\n`),
      ).rows[0];
      expect(parsed.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
    },
  );

  it('marks missing names invalid using the current Student name contract', () => {
    const row = [...validRow];
    for (const index of [0, 3, 4, 7]) row[index] = '';
    expect(
      parseStudentBulkRegistrationCsv(
        Buffer.from(`${header}\n${csvRow(row)}\n`),
      ).rows[0].errors,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'name' })]),
    );
  });

  it('uses current username policy, marks all duplicate usernames, and applies bulk login collisions', () => {
    const first = [...validRow];
    const second = [...validRow];
    second[0] = 'Mona';
    second[11] = 'SARA.HASSAN';
    second[12] = '';
    const rows = parseStudentBulkRegistrationCsv(
      Buffer.from(`${header}\n${csvRow(first)}\n${csvRow(second)}\n`),
    ).rows;
    const settings = loginSettings();
    expect(collectCandidateLoginEmails(rows, settings)).toEqual([
      'sara.hassan@students.example.edu',
    ]);
    validateStudentBulkRegistrationIdentityRows(
      rows,
      settings,
      new Set(['sara.hassan@students.example.edu']),
    );
    expect(
      rows.every((row) =>
        row.errors.some(
          (error) =>
            error.code ===
            STUDENT_BULK_REGISTRATION_ERROR_CODES.duplicateUsername,
        ),
      ),
    ).toBe(true);
    expect(
      rows.every((row) =>
        row.errors.some(
          (error) =>
            error.code ===
            STUDENT_BULK_REGISTRATION_ERROR_CODES.loginIdentityConflict,
        ),
      ),
    ).toBe(true);
  });

  it('reuses reserved/required username policy errors', () => {
    const missing = [...validRow];
    const reserved = [...validRow];
    missing[11] = '';
    reserved[0] = 'Mona';
    reserved[11] = 'admin';
    const rows = parseStudentBulkRegistrationCsv(
      Buffer.from(`${header}\n${csvRow(missing)}\n${csvRow(reserved)}\n`),
    ).rows;
    validateStudentBulkRegistrationIdentityRows(
      rows,
      loginSettings(),
      new Set(),
    );
    expect(rows[0].errors).toContainEqual(
      expect.objectContaining({ reason: 'username_required' }),
    );
    expect(rows[1].errors).toContainEqual(
      expect.objectContaining({ reason: 'reserved_username' }),
    );
  });
});

function csvRow(values: string[]): string {
  return values
    .map((value) =>
      /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value,
    )
    .join(',');
}

function loginSettings(): SchoolLoginSettings {
  return {
    id: 'settings-1',
    schoolId: 'school-1',
    loginDomain: 'students.example.edu',
    usernameMinLength: 3,
    usernameMaxLength: 40,
    allowedCharacters: null,
    reservedUsernames: [],
    status: SchoolLoginSettingsStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

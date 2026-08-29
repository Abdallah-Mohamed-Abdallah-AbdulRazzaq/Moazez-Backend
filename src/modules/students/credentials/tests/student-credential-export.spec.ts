import {
  FileVisibility,
  MembershipStatus,
  OrganizationStatus,
  SchoolStatus,
  StudentCredentialAudienceMode,
  StudentCredentialBatchStatus,
  StudentCredentialMode,
  StudentCredentialRowStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { ExportStudentCredentialBatchUseCase } from '../application/export-student-credential-batch.use-case';
import { StudentCredentialSecretArtifactService } from '../application/student-credential-secret-artifact.service';
import {
  neutralizeSpreadsheetFormula,
  renderStudentCredentialExportCsv,
  STUDENT_CREDENTIAL_EXPORT_HEADERS,
  type StudentCredentialExportStatus,
} from '../domain/student-credential-export.csv';
import { STUDENT_CREDENTIAL_EXPORT_MAX_BYTES } from '../domain/student-credential.constants';
import { StudentCredentialExportTooLargeException } from '../domain/student-credential.exceptions';
import {
  StudentCredentialBatchRepository,
  type StudentCredentialExecutionBatch,
  type StudentCredentialExecutionRow,
  type StudentCredentialExportRow,
} from '../infrastructure/student-credential-batch.repository';

describe('student credential CSV export', () => {
  it.each([
    StudentCredentialBatchStatus.PENDING,
    StudentCredentialBatchStatus.PROCESSING,
  ])('rejects a %s batch as not ready', async (status) => {
    const fixture = createFixture({ status });
    await expect(
      withScope(() => fixture.service.execute(BATCH_ID)),
    ).rejects.toMatchObject({
      code: 'students.credentials.export_not_ready',
      httpStatus: 409,
    });
    expect(fixture.artifact.readAndVerify).not.toHaveBeenCalled();
  });

  it('rejects a terminal batch without generated rows', async () => {
    const fixture = createFixture({
      status: StudentCredentialBatchStatus.FAILED,
      generatedRows: 0,
    });
    await expect(
      withScope(() => fixture.service.execute(BATCH_ID)),
    ).rejects.toMatchObject({
      code: 'students.credentials.export_empty',
      httpStatus: 409,
    });
  });

  it('fails closed for an impossible FAILED batch with generated rows', async () => {
    const fixture = createFixture({
      status: StudentCredentialBatchStatus.FAILED,
      generatedRows: 1,
    });
    await expect(
      withScope(() => fixture.service.execute(BATCH_ID)),
    ).rejects.toMatchObject({
      code: 'students.credentials.execution_invariant_invalid',
    });
    expect(fixture.artifact.readAndVerify).not.toHaveBeenCalled();
  });

  it('returns not found without reading an artifact for a foreign-school batch', async () => {
    const fixture = createFixture();
    fixture.repository.findScopedExecutionBatchById.mockResolvedValue(null);
    await expect(
      withScope(() => fixture.service.execute(BATCH_ID)),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(fixture.artifact.readAndVerify).not.toHaveBeenCalled();
  });

  it('exports only generated rows and suppresses stale plaintext', async () => {
    const generatedAt = new Date('2026-08-27T12:00:00.000Z');
    const rows = [
      exportRow('row-current', 'student-current', 'user-current', generatedAt),
      exportRow('row-changed', 'student-changed', 'user-changed', generatedAt, {
        credentialVersion: 3,
      }),
      exportRow(
        'row-ineligible',
        'student-ineligible',
        'user-ineligible',
        generatedAt,
        {
          studentStatus: StudentStatus.SUSPENDED,
        },
      ),
    ];
    const executionRows = [
      ...rows.map(executionRowFromExport),
      executionRow('row-skipped', StudentCredentialRowStatus.SKIPPED),
      executionRow('row-failed', StudentCredentialRowStatus.FAILED),
    ];
    const fixture = createFixture({
      status: StudentCredentialBatchStatus.PARTIAL_FAILED,
      generatedRows: 3,
      executionRows,
      exportRows: rows,
      passwords: new Map([
        ['row-current', 'Current-Secret1!'],
        ['row-changed', 'Changed-Secret2!'],
        ['row-ineligible', 'Ineligible-Secret3!'],
        ['row-skipped', 'Skipped-Secret4!'],
        ['row-failed', 'Failed-Secret5!'],
      ]),
    });

    const result = await withScope(() => fixture.service.execute(BATCH_ID));
    const csv = result.body.toString('utf8');

    expect(result.filename).toBe(`student-credentials-${BATCH_ID}.csv`);
    expect(result.body.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv).toContain('Current-Secret1!');
    expect(csv).toContain('temporary_credential');
    expect(csv).toContain('credential_changed');
    expect(csv).toContain('account_ineligible');
    expect(csv).not.toContain('Changed-Secret2!');
    expect(csv).not.toContain('Ineligible-Secret3!');
    expect(csv).not.toContain('Skipped-Secret4!');
    expect(csv).not.toContain('Failed-Secret5!');
    expect(fixture.repository.recordExportAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        generatedRows: 3,
        temporaryCredentialsExported: 1,
        credentialChangedRows: 1,
        accountIneligibleRows: 1,
      }),
    );
    expect(fixture.repository.recordExportAudit).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: 'changed Student link',
      mutate: (row: StudentCredentialExportRow) => {
        row.student.userId = 'different-user';
      },
    },
    {
      name: 'suspended User',
      mutate: (row: StudentCredentialExportRow) => {
        row.user!.status = UserStatus.SUSPENDED;
      },
    },
    {
      name: 'removed active Student membership',
      mutate: (row: StudentCredentialExportRow) => {
        row.user!.memberships = [];
      },
    },
  ])('suppresses plaintext for an account with $name', async ({ mutate }) => {
    const generatedAt = new Date('2026-08-27T12:00:00.000Z');
    const row = exportRow('row-1', 'student-1', 'user-1', generatedAt);
    mutate(row);
    const fixture = createFixture({
      exportRows: [row],
      executionRows: [executionRowFromExport(row)],
      passwords: new Map([['row-1', 'Never-Disclose-1!']]),
    });

    const csv = (
      await withScope(() => fixture.service.execute(BATCH_ID))
    ).body.toString('utf8');

    expect(csv).toContain('account_ineligible');
    expect(csv).not.toContain('Never-Disclose-1!');
  });

  it('fails the plaintext response when audit persistence fails', async () => {
    const fixture = createFixture();
    fixture.repository.recordExportAudit.mockRejectedValue(
      new Error('audit_unavailable'),
    );
    await expect(
      withScope(() => fixture.service.execute(BATCH_ID)),
    ).rejects.toThrow('audit_unavailable');
  });

  it.each([
    'students.credentials.secret_artifact_expired',
    'students.credentials.secret_artifact_invalid',
  ])(
    'does not audit or disclose when canonical verification reports %s',
    async (code) => {
      const fixture = createFixture();
      fixture.artifact.readAndVerify.mockRejectedValue(
        Object.assign(new Error(code), { code }),
      );
      await expect(
        withScope(() => fixture.service.execute(BATCH_ID)),
      ).rejects.toMatchObject({ code });
      expect(fixture.repository.listGeneratedExportRows).not.toHaveBeenCalled();
      expect(fixture.repository.recordExportAudit).not.toHaveBeenCalled();
    },
  );

  it('neutralizes spreadsheet formulas before RFC-style quoting', () => {
    const dangerous = [
      '=1+1',
      '+SUM(A1:A2)',
      '-1+2',
      '@SUM(A1:A2)',
      '\t=1+1',
      '   =1+1',
      '\r=cmd',
      '\n=cmd',
    ];
    for (const value of dangerous) {
      expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`);
    }
    expect(neutralizeSpreadsheetFormula('MZ-safe-value')).toBe('MZ-safe-value');
    const body = renderStudentCredentialExportCsv([
      {
        studentId: '=1+1',
        studentName: '   =1+1',
        username: '@user',
        loginEmail: '-1+2',
        temporaryPassword: '\tsecret',
        credentialStatus: '+SUM(A1:A2)' as StudentCredentialExportStatus,
        mustChangePassword: 'true',
        generatedAt: '2026-08-27T12:00:00.000Z',
      },
    ]).toString('utf8');
    expect(body).toContain('"\'=1+1"');
    expect(body).toContain('"\'   =1+1"');
    expect(body).toContain('"\'-1+2"');
    expect(body).toContain('"\'\tsecret"');
    expect(body).toContain('"\'+SUM(A1:A2)"');
    expect(body).not.toContain('sep=');
  });

  it('renders the exact deterministic UTF-8 CSV structure', () => {
    const rows = [
      {
        studentId: 'student,1',
        studentName: 'أحمد "Ahmed"\nStudent',
        username: '',
        loginEmail: 'safe@example.test',
        temporaryPassword: 'MZ-safe-value',
        credentialStatus: 'temporary_credential' as const,
        mustChangePassword: 'true',
        generatedAt: '2026-08-27T12:00:00.000Z',
      },
    ];

    const first = renderStudentCredentialExportCsv(rows);
    const second = renderStudentCredentialExportCsv(rows);
    const expected =
      `\uFEFF${STUDENT_CREDENTIAL_EXPORT_HEADERS.map((value) => `"${value}"`).join(',')}\r\n` +
      '"student,1","أحمد ""Ahmed""\nStudent","","safe@example.test","MZ-safe-value","temporary_credential","true","2026-08-27T12:00:00.000Z"\r\n';

    expect(first.equals(second)).toBe(true);
    expect(first.toString('utf8')).toBe(expected);
    expect(first.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(first.toString('utf8').endsWith('\r\n')).toBe(true);
    expect(STUDENT_CREDENTIAL_EXPORT_HEADERS).toHaveLength(8);
  });

  it('fails closed before returning a CSV that exceeds the byte bound', () => {
    expect(STUDENT_CREDENTIAL_EXPORT_MAX_BYTES).toBe(64 * 1024 * 1024);
    expect(() =>
      renderStudentCredentialExportCsv(
        [
          {
            studentId: 'student',
            studentName: 'name',
            username: 'username',
            loginEmail: 'email@example.test',
            temporaryPassword: 'secret',
            credentialStatus: 'temporary_credential',
            mustChangePassword: 'true',
            generatedAt: '2026-08-27T12:00:00.000Z',
          },
        ],
        16,
      ),
    ).toThrow(StudentCredentialExportTooLargeException);
  });
});

const BATCH_ID = '10000000-0000-4000-8000-000000000001';
const SCHOOL_ID = '20000000-0000-4000-8000-000000000001';
const ORGANIZATION_ID = '30000000-0000-4000-8000-000000000001';
const ACTOR_ID = '40000000-0000-4000-8000-000000000001';

function createFixture(
  input: {
    status?: StudentCredentialBatchStatus;
    generatedRows?: number;
    executionRows?: StudentCredentialExecutionRow[];
    exportRows?: StudentCredentialExportRow[];
    passwords?: Map<string, string>;
  } = {},
) {
  const generatedAt = new Date('2026-08-27T12:00:00.000Z');
  const exportRows = input.exportRows ?? [
    exportRow('row-1', 'student-1', 'user-1', generatedAt),
  ];
  const executionRows =
    input.executionRows ?? exportRows.map(executionRowFromExport);
  const batch = batchFixture(
    input.status ?? StudentCredentialBatchStatus.COMPLETED,
    input.generatedRows ?? exportRows.length,
  );
  const passwords = input.passwords ?? new Map([['row-1', 'Secret-1!']]);
  const repository = {
    findScopedExecutionBatchById: jest.fn().mockResolvedValue(batch),
    listExecutionRows: jest.fn().mockResolvedValue(executionRows),
    listGeneratedExportRows: jest.fn().mockResolvedValue(exportRows),
    recordExportAudit: jest.fn().mockResolvedValue(undefined),
  };
  const artifact = {
    readAndVerify: jest.fn().mockResolvedValue({
      version: 1,
      batchId: BATCH_ID,
      credentialMode: 'unique_generated',
      createdAt: '2026-08-27T11:00:00.000Z',
      entries: executionRows.map((row) => ({
        rowId: row.id,
        studentId: row.studentId,
        userId: row.userId,
        temporaryPassword: passwords.get(row.id) ?? `secret-${row.id}`,
      })),
    }),
  };
  return {
    repository,
    artifact,
    service: new ExportStudentCredentialBatchUseCase(
      repository as unknown as StudentCredentialBatchRepository,
      artifact as unknown as StudentCredentialSecretArtifactService,
    ),
  };
}

function withScope<T>(callback: () => T): T {
  const context = createRequestContext('credential-export-test');
  context.actor = { id: ACTOR_ID, userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: 'membership-1',
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    roleId: 'role-1',
    permissions: [],
  };
  return runWithRequestContext(context, callback);
}

function batchFixture(
  status: StudentCredentialBatchStatus,
  generatedRows: number,
): StudentCredentialExecutionBatch {
  const stagedAt = new Date('2026-08-27T11:00:00.000Z');
  return {
    id: BATCH_ID,
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    audienceMode: StudentCredentialAudienceMode.SELECTED_STUDENTS,
    credentialMode: StudentCredentialMode.UNIQUE_GENERATED,
    sourceRegistrationBatchId: null,
    academicYearId: null,
    stageId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
    status,
    totalRows: Math.max(generatedRows, 1),
    generatedRows,
    skippedRows: 0,
    failedRows: generatedRows === 0 ? 1 : 0,
    createdById: ACTOR_ID,
    createdAt: new Date('2026-08-27T10:00:00.000Z'),
    updatedAt: stagedAt,
    startedAt: stagedAt,
    completedAt:
      status === StudentCredentialBatchStatus.PROCESSING ? null : stagedAt,
    secretArtifactFileId: 'file-1',
    secretArtifactVersion: 1,
    secretArtifactStagedAt: stagedAt,
    secretArtifactExpiresAt: new Date('2026-08-28T11:00:00.000Z'),
    createdBy: { userType: UserType.SCHOOL_USER },
    school: {
      id: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      status: SchoolStatus.ACTIVE,
      deletedAt: null,
      organization: {
        id: ORGANIZATION_ID,
        status: OrganizationStatus.ACTIVE,
        deletedAt: null,
      },
    },
    secretArtifactFile: {
      id: 'file-1',
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      uploaderId: ACTOR_ID,
      bucket: 'private',
      objectKey: 'key',
      originalName: 'student-credential-secret-v1.json',
      mimeType: 'application/vnd.moazez.student-credentials+json',
      sizeBytes: 100n,
      checksumSha256: 'a'.repeat(64),
      visibility: FileVisibility.PRIVATE,
      deletedAt: null,
    },
  };
}

function exportRow(
  id: string,
  studentId: string,
  userId: string,
  generatedAt: Date,
  overrides: {
    credentialVersion?: number;
    studentStatus?: StudentStatus;
  } = {},
): StudentCredentialExportRow {
  return {
    id,
    schoolId: SCHOOL_ID,
    batchId: BATCH_ID,
    studentId,
    userId,
    status: StudentCredentialRowStatus.GENERATED,
    credentialVersionAfter: 2,
    generatedAt,
    createdAt: generatedAt,
    student: {
      id: studentId,
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      userId,
      firstName: `First ${id}`,
      lastName: `Last ${id}`,
      status: overrides.studentStatus ?? StudentStatus.ACTIVE,
      deletedAt: null,
    },
    user: {
      id: userId,
      email: `${userId}@example.test`,
      username: userId,
      passwordHash: 'hash',
      mustChangePassword: true,
      passwordProvisionedAt: generatedAt,
      credentialVersion: overrides.credentialVersion ?? 2,
      userType: UserType.STUDENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
      memberships: [
        {
          schoolId: SCHOOL_ID,
          organizationId: ORGANIZATION_ID,
          userType: UserType.STUDENT,
          status: MembershipStatus.ACTIVE,
          deletedAt: null,
        },
      ],
    },
  };
}

function executionRowFromExport(
  row: StudentCredentialExportRow,
): StudentCredentialExecutionRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    batchId: row.batchId,
    studentId: row.studentId,
    userId: row.userId,
    status: row.status,
    credentialVersionBefore: 1,
    credentialVersionAfter: row.credentialVersionAfter,
    generatedAt: row.generatedAt,
  };
}

function executionRow(
  id: string,
  status: StudentCredentialRowStatus,
): StudentCredentialExecutionRow {
  return {
    id,
    schoolId: SCHOOL_ID,
    batchId: BATCH_ID,
    studentId: `student-${id}`,
    userId: `user-${id}`,
    status,
    credentialVersionBefore: 1,
    credentialVersionAfter: null,
    generatedAt: null,
  };
}

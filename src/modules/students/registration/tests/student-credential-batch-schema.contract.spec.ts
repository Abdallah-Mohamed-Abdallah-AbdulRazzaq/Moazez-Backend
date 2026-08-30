import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

const ROOT = join(__dirname, '../../../../..');

const EXPECTED_AUDIENCE_MODES = [
  'IMPORT_BATCH',
  'SELECTED_STUDENTS',
  'ACADEMIC_YEAR',
  'STAGE',
  'GRADE',
  'SECTION',
  'CLASSROOM',
  'MISSING_PASSWORD',
];
const EXPECTED_CREDENTIAL_MODES = [
  'UNIQUE_GENERATED',
  'SHARED_TEMPORARY',
  'SHARED_ADMIN_PROVIDED',
];
const EXPECTED_BATCH_STATUSES = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'PARTIAL_FAILED',
  'FAILED',
];
const EXPECTED_ROW_STATUSES = [
  'PENDING',
  'PROCESSING',
  'GENERATED',
  'SKIPPED',
  'FAILED',
];

const STUDENT_CREDENTIAL_DELEGATES = [
  'studentCredentialBatch',
  'studentCredentialRow',
] as const satisfies readonly (keyof PrismaClient)[];

function getGeneratedModel(name: string) {
  const model = Prisma.dmmf.datamodel.models.find(
    (candidate) => candidate.name === name,
  );

  expect(model).toBeDefined();
  return model!;
}

function getGeneratedEnum(name: string) {
  const generatedEnum = Prisma.dmmf.datamodel.enums.find(
    (candidate) => candidate.name === name,
  );

  expect(generatedEnum).toBeDefined();
  return generatedEnum!;
}

function getField(
  model: ReturnType<typeof getGeneratedModel>,
  fieldName: string,
) {
  const field = model.fields.find((candidate) => candidate.name === fieldName);

  expect(field).toBeDefined();
  return field!;
}

function extractPrismaModel(schema: string, name: string): string {
  const model = schema.match(
    new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`, 'u'),
  )?.[0];

  expect(model).toBeDefined();
  return model ?? '';
}

describe('student credential persistence contract', () => {
  it('exposes the student-specific models and tables in generated Prisma', () => {
    expect(Prisma.ModelName.StudentCredentialBatch).toBe(
      'StudentCredentialBatch',
    );
    expect(Prisma.ModelName.StudentCredentialRow).toBe('StudentCredentialRow');
    expect(STUDENT_CREDENTIAL_DELEGATES).toEqual([
      'studentCredentialBatch',
      'studentCredentialRow',
    ]);

    const batch = getGeneratedModel('StudentCredentialBatch');
    const row = getGeneratedModel('StudentCredentialRow');

    expect(batch.dbName).toBe('student_credential_batches');
    expect(row.dbName).toBe('student_credential_rows');
    expect(getField(batch, 'schoolId')).toMatchObject({
      kind: 'scalar',
      type: 'String',
      isRequired: true,
    });
    expect(getField(batch, 'organizationId')).toMatchObject({
      kind: 'scalar',
      type: 'String',
      isRequired: true,
    });
    expect(getField(row, 'schoolId')).toMatchObject({
      kind: 'scalar',
      type: 'String',
      isRequired: true,
    });
  });

  it('pins the exact audience, mode, and lifecycle enums and defaults', () => {
    expect(
      getGeneratedEnum('StudentCredentialAudienceMode').values.map(
        (value) => value.name,
      ),
    ).toEqual(EXPECTED_AUDIENCE_MODES);
    expect(
      getGeneratedEnum('StudentCredentialMode').values.map(
        (value) => value.name,
      ),
    ).toEqual(EXPECTED_CREDENTIAL_MODES);
    expect(
      getGeneratedEnum('StudentCredentialBatchStatus').values.map(
        (value) => value.name,
      ),
    ).toEqual(EXPECTED_BATCH_STATUSES);
    expect(
      getGeneratedEnum('StudentCredentialRowStatus').values.map(
        (value) => value.name,
      ),
    ).toEqual(EXPECTED_ROW_STATUSES);
    expect(
      getField(getGeneratedModel('StudentCredentialBatch'), 'status').default,
    ).toBe('PENDING');
    expect(
      getField(getGeneratedModel('StudentCredentialRow'), 'status').default,
    ).toBe('PENDING');
  });

  it('keeps every student audience selector optional and tenant-bound', () => {
    const batch = getGeneratedModel('StudentCredentialBatch');

    expect(getField(batch, 'sourceRegistrationBatch')).toMatchObject({
      type: 'StudentBulkRegistrationBatch',
      isRequired: false,
      relationName: 'StudentCredentialBatchSourceRegistrationBatch',
      relationFromFields: ['sourceRegistrationBatchId', 'schoolId'],
      relationToFields: ['id', 'schoolId'],
      relationOnDelete: 'Restrict',
    });

    for (const [fieldName, type, idField] of [
      ['academicYear', 'AcademicYear', 'academicYearId'],
      ['stage', 'Stage', 'stageId'],
      ['grade', 'Grade', 'gradeId'],
      ['section', 'Section', 'sectionId'],
      ['classroom', 'Classroom', 'classroomId'],
    ] as const) {
      expect(getField(batch, fieldName)).toMatchObject({
        type,
        isRequired: false,
        relationFromFields: [idField, 'schoolId'],
        relationToFields: ['id', 'schoolId'],
        relationOnDelete: 'Restrict',
      });
    }

    expect(getField(batch, 'createdBy')).toMatchObject({
      type: 'User',
      isRequired: true,
      relationName: 'StudentCredentialBatchCreatedBy',
      relationFromFields: ['createdById'],
      relationOnDelete: 'Restrict',
    });
    expect(getField(batch, 'secretArtifactFile')).toMatchObject({
      type: 'File',
      isRequired: false,
      relationName: 'StudentCredentialBatchSecretArtifact',
      relationFromFields: ['secretArtifactFileId'],
      relationOnDelete: 'SetNull',
    });
  });

  it('binds credential rows to their school, batch, Student, and optional Enrollment identity', () => {
    const row = getGeneratedModel('StudentCredentialRow');

    expect(getField(row, 'batch')).toMatchObject({
      type: 'StudentCredentialBatch',
      isRequired: true,
      relationFromFields: ['batchId', 'schoolId'],
      relationToFields: ['id', 'schoolId'],
      relationOnDelete: 'Cascade',
    });
    expect(getField(row, 'student')).toMatchObject({
      type: 'Student',
      isRequired: true,
      relationFromFields: ['studentId', 'schoolId'],
      relationToFields: ['id', 'schoolId'],
      relationOnDelete: 'Restrict',
    });
    expect(getField(row, 'user')).toMatchObject({
      type: 'User',
      isRequired: false,
      relationName: 'StudentCredentialRowUser',
      relationFromFields: ['userId'],
      relationOnDelete: 'Restrict',
    });
    expect(getField(row, 'enrollment')).toMatchObject({
      type: 'Enrollment',
      isRequired: false,
      relationName: 'StudentCredentialRowEnrollment',
      relationFromFields: ['enrollmentId', 'schoolId'],
      relationToFields: ['id', 'schoolId'],
      relationOnDelete: 'Restrict',
    });
    expect(getField(row, 'studentId').isRequired).toBe(true);
    expect(getField(row, 'userId').isRequired).toBe(false);
    expect(getField(row, 'enrollmentId').isRequired).toBe(false);
    expect(getField(row, 'enrollmentId').dbName).toBe('enrollment_id');
  });

  it('enforces per-school and per-batch identities with bounded indexes', () => {
    const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');
    const batchSchema = extractPrismaModel(schema, 'StudentCredentialBatch');
    const rowSchema = extractPrismaModel(schema, 'StudentCredentialRow');
    const batch = getGeneratedModel('StudentCredentialBatch');
    const row = getGeneratedModel('StudentCredentialRow');

    expect(batch.uniqueFields).toContainEqual(['id', 'schoolId']);
    expect(row.uniqueFields).toContainEqual(['id', 'schoolId']);
    expect(row.uniqueFields).toContainEqual(['batchId', 'studentId']);
    expect(row.uniqueFields).toContainEqual(['batchId', 'userId']);
    expect(getField(batch, 'secretArtifactFileId').isUnique).toBe(true);
    expect(batchSchema).toContain(
      '@@index([schoolId, status, createdAt(sort: Desc)]',
    );
    expect(batchSchema).toContain(
      '@@index([schoolId, audienceMode, createdAt(sort: Desc)]',
    );
    expect(rowSchema).toContain('@@index([schoolId, batchId, status]');
    expect(rowSchema).toContain('@@index([schoolId, enrollmentId]');
  });

  it('stores only secret-artifact metadata and row version evidence', () => {
    const batch = getGeneratedModel('StudentCredentialBatch');
    const row = getGeneratedModel('StudentCredentialRow');
    const scalarFieldNames = [...batch.fields, ...row.fields]
      .filter((field) => field.kind === 'scalar')
      .map((field) => field.name);

    expect(scalarFieldNames).toEqual(
      expect.arrayContaining([
        'secretArtifactFileId',
        'secretArtifactVersion',
        'secretArtifactStagedAt',
        'secretArtifactExpiresAt',
        'credentialVersionBefore',
        'credentialVersionAfter',
      ]),
    );
    expect(
      scalarFieldNames.filter((fieldName) =>
        /password|plaintext|secretValue|credentialSecret/iu.test(fieldName),
      ),
    ).toEqual([]);
  });

  it('owns exactly one additive Stage 7 migration with no credential secret columns', () => {
    const migrationsRoot = join(ROOT, 'prisma/migrations');
    const stageMigrations = readdirSync(migrationsRoot).filter((entry) =>
      /^\d{14}_student_credential_batch_domain$/u.test(entry),
    );

    expect(stageMigrations).toHaveLength(1);
    const sql = readFileSync(
      join(migrationsRoot, stageMigrations[0], 'migration.sql'),
      'utf8',
    );

    for (const expected of [
      'student_credential_audience_mode',
      'student_credential_mode',
      'student_credential_batch_status',
      'student_credential_row_status',
      'student_credential_batches',
      'student_credential_rows',
      'student_credential_batches_id_school_key',
      'student_credential_rows_batch_student_key',
      'student_credential_rows_batch_user_key',
      'student_cred_batches_source_registration_fkey',
      'student_cred_rows_batch_fkey',
      'student_cred_rows_student_fkey',
    ]) {
      expect(sql).toContain(expected);
    }
    expect(sql).not.toMatch(
      /password_hash|temporary_password|shared_password|plaintext|secret_value|credential_secret/iu,
    );
    expect(sql).not.toMatch(
      /^\s*(?:DROP\s+(?:TABLE|COLUMN|TYPE|INDEX|CONSTRAINT)|TRUNCATE\b|DELETE\b|UPDATE\b|ALTER\s+TABLE\b.*\b(?:DROP|ALTER\s+COLUMN)\b)/imu,
    );
    expect(sql).not.toMatch(
      /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|TRIGGER|VIEW)\b/imu,
    );
  });

  it('owns exactly one additive placement-context migration', () => {
    const migrationsRoot = join(ROOT, 'prisma/migrations');
    const migrationDirectories = readdirSync(migrationsRoot).filter((entry) =>
      /^\d{14}_student_credential_admin_mode_placement_context$/u.test(entry),
    );

    expect(migrationDirectories).toEqual([
      '20260829223100_student_credential_admin_mode_placement_context',
    ]);
    const sql = readFileSync(
      join(migrationsRoot, migrationDirectories[0], 'migration.sql'),
      'utf8',
    );

    expect(sql).toContain(
      `ALTER TYPE "student_credential_mode" ADD VALUE 'SHARED_ADMIN_PROVIDED'`,
    );
    expect(sql).toContain(
      'ALTER TABLE "student_credential_rows" ADD COLUMN     "enrollment_id" UUID',
    );
    expect(sql).toContain('student_cred_rows_school_enrollment_idx');
    expect(sql).toContain('student_cred_rows_enrollment_fkey');
    expect(sql).toContain(
      'FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT',
    );
    expect(sql).not.toMatch(
      /^\s*(?:DROP\s+(?:TABLE|COLUMN|TYPE|INDEX|CONSTRAINT)|TRUNCATE\b|DELETE\b|UPDATE\b|ALTER\s+TABLE\b.*\b(?:DROP|ALTER\s+COLUMN)\b)/imu,
    );
  });
});

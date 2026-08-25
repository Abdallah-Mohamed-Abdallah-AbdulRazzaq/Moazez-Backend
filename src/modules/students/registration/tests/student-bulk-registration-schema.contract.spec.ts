import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

const ROOT = join(__dirname, '../../../../..');
const EXPECTED_BATCH_STATUSES = [
  'UPLOADED',
  'VALIDATING',
  'VALIDATION_FAILED',
  'READY',
  'EXECUTING',
  'EXECUTION_PARTIAL_FAILED',
  'FAILED',
  'COMPLETED',
];
const EXPECTED_ROW_STATUSES = [
  'PENDING',
  'VALID',
  'INVALID',
  'PROCESSING',
  'CREATED',
  'FAILED',
];

const BULK_REGISTRATION_DELEGATES = [
  'studentBulkRegistrationBatch',
  'studentBulkRegistrationRow',
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

describe('student bulk registration persistence contract', () => {
  it('exposes both models and delegates in the generated Prisma contract', () => {
    expect(Prisma.ModelName.StudentBulkRegistrationBatch).toBe(
      'StudentBulkRegistrationBatch',
    );
    expect(Prisma.ModelName.StudentBulkRegistrationRow).toBe(
      'StudentBulkRegistrationRow',
    );
    expect(BULK_REGISTRATION_DELEGATES).toEqual([
      'studentBulkRegistrationBatch',
      'studentBulkRegistrationRow',
    ]);

    const batch = getGeneratedModel('StudentBulkRegistrationBatch');
    const row = getGeneratedModel('StudentBulkRegistrationRow');

    expect(batch.dbName).toBe('student_bulk_registration_batches');
    expect(row.dbName).toBe('student_bulk_registration_rows');
    expect(getField(batch, 'schoolId')).toMatchObject({
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

  it('pins the batch and row lifecycle enums and defaults', () => {
    const batchStatus = getGeneratedEnum('StudentBulkRegistrationBatchStatus');
    const rowStatus = getGeneratedEnum('StudentBulkRegistrationRowStatus');

    expect(batchStatus.dbName).toBe('student_bulk_registration_batch_status');
    expect(batchStatus.values.map((value) => value.name)).toEqual(
      EXPECTED_BATCH_STATUSES,
    );
    expect(rowStatus.dbName).toBe('student_bulk_registration_row_status');
    expect(rowStatus.values.map((value) => value.name)).toEqual(
      EXPECTED_ROW_STATUSES,
    );
    expect(
      getField(getGeneratedModel('StudentBulkRegistrationBatch'), 'status')
        .default,
    ).toBe('UPLOADED');
    expect(
      getField(getGeneratedModel('StudentBulkRegistrationRow'), 'status')
        .default,
    ).toBe('PENDING');
  });

  it('enforces source ownership and per-row identity without making row hashes unique', () => {
    const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');
    const batchSchema = extractPrismaModel(
      schema,
      'StudentBulkRegistrationBatch',
    );
    const rowSchema = extractPrismaModel(schema, 'StudentBulkRegistrationRow');
    const batch = getGeneratedModel('StudentBulkRegistrationBatch');
    const row = getGeneratedModel('StudentBulkRegistrationRow');

    expect(batch.uniqueFields).toContainEqual([
      'sourceImportJobId',
      'schoolId',
    ]);
    expect(row.uniqueFields).toContainEqual(['batchId', 'rowNumber']);
    expect(getField(row, 'rowHash').isUnique).toBe(false);
    expect(rowSchema).toContain('@@index([batchId, rowHash]');
    expect(rowSchema).not.toContain('@@unique([batchId, rowHash]');
    expect(batchSchema).toContain('@default(UPLOADED)');
    expect(rowSchema).toContain('@default(PENDING)');
  });

  it('keeps reconciliation links nullable and tenant-bound where possible', () => {
    const batch = getGeneratedModel('StudentBulkRegistrationBatch');
    const row = getGeneratedModel('StudentBulkRegistrationRow');

    for (const fieldName of ['studentId', 'userId', 'enrollmentId']) {
      expect(getField(row, fieldName).isRequired).toBe(false);
    }
    expect(getField(batch, 'sourceImportJob')).toMatchObject({
      type: 'ImportJob',
      isRequired: true,
      isList: false,
      relationFromFields: ['sourceImportJobId', 'schoolId'],
      relationToFields: ['id', 'schoolId'],
      relationOnDelete: 'Restrict',
    });
    expect(
      getField(getGeneratedModel('ImportJob'), 'studentBulkRegistrationBatch'),
    ).toMatchObject({
      type: 'StudentBulkRegistrationBatch',
      isRequired: false,
      isList: false,
      relationName: 'StudentBulkRegistrationBatchSourceImportJob',
    });
    expect(getField(row, 'batch')).toMatchObject({
      type: 'StudentBulkRegistrationBatch',
      relationFromFields: ['batchId', 'schoolId'],
      relationToFields: ['id', 'schoolId'],
      relationOnDelete: 'Cascade',
    });
    expect(getField(row, 'student')).toMatchObject({
      type: 'Student',
      isRequired: false,
      relationFromFields: ['studentId', 'schoolId'],
    });
    expect(getField(row, 'enrollment')).toMatchObject({
      type: 'Enrollment',
      isRequired: false,
      relationFromFields: ['enrollmentId', 'schoolId'],
    });
    expect(getField(row, 'user')).toMatchObject({
      type: 'User',
      isRequired: false,
      relationFromFields: ['userId'],
    });
  });

  it('owns exactly one non-destructive Stage 2 migration contract', () => {
    const migrationsRoot = join(ROOT, 'prisma/migrations');
    const stageMigrations = readdirSync(migrationsRoot).filter((entry) =>
      /^\d{14}_student_bulk_registration_domain$/u.test(entry),
    );

    expect(stageMigrations).toHaveLength(1);
    const sql = readFileSync(
      join(migrationsRoot, stageMigrations[0], 'migration.sql'),
      'utf8',
    );

    expect(sql).toContain('student_bulk_registration_batches');
    expect(sql).toContain('student_bulk_registration_rows');
    expect(sql).toContain('student_bulk_batches_source_import_job_key');
    expect(sql).toContain('student_bulk_rows_batch_row_number_key');
    expect(sql).toContain('student_bulk_rows_batch_hash_idx');
    expect(sql).not.toContain(
      'CREATE UNIQUE INDEX "student_bulk_rows_batch_hash_idx"',
    );
    expect(sql).not.toMatch(
      /^\s*(?:DROP\s+(?:TABLE|COLUMN|TYPE|INDEX|CONSTRAINT)|TRUNCATE\b|DELETE\b|UPDATE\b|ALTER\s+TABLE\b.*\b(?:DROP|ALTER\s+COLUMN)\b)/imu,
    );
    expect(sql).not.toMatch(
      /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|TRIGGER|VIEW)\b/imu,
    );
  });
});

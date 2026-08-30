import { Injectable } from '@nestjs/common';
import {
  FileVisibility,
  StudentCredentialBatchStatus,
  StudentCredentialMode,
  StudentCredentialRowStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { isObjectStorageNotFoundError } from '../../../../infrastructure/storage/object-storage.errors';
import { generateTemporaryPassword } from '../../../settings/users/credentials/domain/credential-password.policy';
import {
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_EXPIRED_CODE,
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_MAX_BYTES,
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME,
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_ORIGINAL_NAME,
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_TTL_MS,
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_UNAVAILABLE_CODE,
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION,
} from '../domain/student-credential.constants';
import { studentCredentialSecretArtifactObjectKey } from '../domain/student-credential-secret-artifact-key';
import {
  StudentCredentialExecutionInvariantException,
  StudentCredentialSecretArtifactException,
} from '../domain/student-credential.exceptions';
import {
  mapStudentCredentialModeToApi,
  type StudentCredentialArtifactEntry,
  type StudentCredentialSecretArtifact,
} from '../domain/student-credential.types';
import {
  StudentCredentialBatchRepository,
  type StudentCredentialExecutionBatch,
  type StudentCredentialExecutionRow,
} from '../infrastructure/student-credential-batch.repository';

const MAX_PASSWORD_COLLISION_ATTEMPTS = 10;

@Injectable()
export class StudentCredentialSecretArtifactService {
  constructor(
    private readonly repository: StudentCredentialBatchRepository,
    private readonly storage: StorageService,
  ) {}

  async ensureArtifact(input: {
    batch: StudentCredentialExecutionBatch;
    rows: StudentCredentialExecutionRow[];
    now: Date;
  }): Promise<StudentCredentialSecretArtifact> {
    const hasPointer = input.batch.secretArtifactFileId !== null;
    const hasAnyMetadata =
      hasPointer ||
      input.batch.secretArtifactVersion !== null ||
      input.batch.secretArtifactStagedAt !== null ||
      input.batch.secretArtifactExpiresAt !== null;
    if (hasPointer)
      return this.readAndVerify(input.batch, input.rows, input.now);
    if (hasAnyMetadata) {
      throw new StudentCredentialSecretArtifactException(
        STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
      );
    }
    if (
      input.batch.credentialMode === StudentCredentialMode.SHARED_ADMIN_PROVIDED
    ) {
      throw new StudentCredentialSecretArtifactException(
        STUDENT_CREDENTIAL_SECRET_ARTIFACT_UNAVAILABLE_CODE,
      );
    }
    if (
      input.batch.generatedRows !== 0 ||
      input.batch.skippedRows !== 0 ||
      input.batch.failedRows !== 0 ||
      input.rows.some(
        (row) => row.status !== StudentCredentialRowStatus.PENDING,
      )
    ) {
      throw new StudentCredentialSecretArtifactException(
        STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
      );
    }

    const artifact = buildArtifact(input.batch, input.rows, input.now);
    const body = Buffer.from(JSON.stringify(artifact), 'utf8');
    if (body.byteLength > STUDENT_CREDENTIAL_SECRET_ARTIFACT_MAX_BYTES) {
      throw new StudentCredentialSecretArtifactException(
        STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
      );
    }
    const checksumSha256 = createHash('sha256').update(body).digest('hex');
    const objectKey = studentCredentialSecretArtifactObjectKey({
      schoolId: input.batch.schoolId,
      batchId: input.batch.id,
    });
    const stored = await this.storage.saveObject({
      objectKey,
      body,
      sizeBytes: body.byteLength,
      visibility: FileVisibility.PRIVATE,
      contentType: STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME,
      metadata: {
        purpose: 'student-credential-secret-artifact',
        batchId: input.batch.id,
        artifactVersion: String(STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION),
        sha256: checksumSha256,
      },
    });
    try {
      await this.repository.attachSecretArtifact({
        batchId: input.batch.id,
        schoolId: input.batch.schoolId,
        organizationId: input.batch.organizationId,
        uploaderId: input.batch.createdById,
        bucket: stored.bucket,
        objectKey,
        originalName: STUDENT_CREDENTIAL_SECRET_ARTIFACT_ORIGINAL_NAME,
        mimeType: STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME,
        sizeBytes: BigInt(body.byteLength),
        checksumSha256,
        artifactVersion: STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION,
        stagedAt: input.now,
        expiresAt: new Date(
          input.now.getTime() + STUDENT_CREDENTIAL_SECRET_ARTIFACT_TTL_MS,
        ),
      });
    } catch (error) {
      const persisted = await this.repository
        .findExecutionBatchById(input.batch.id)
        .catch(() => null);
      if (persisted?.secretArtifactFileId) {
        return this.readAndVerify(persisted, input.rows, input.now);
      }
      await this.storage
        .deleteObject({ bucket: stored.bucket, objectKey })
        .catch(() => undefined);
      throw error;
    }
    const persisted = await this.repository.findExecutionBatchById(
      input.batch.id,
    );
    if (!persisted) {
      throw new StudentCredentialExecutionInvariantException(
        'artifact_batch_disappeared',
      );
    }
    return this.readAndVerify(persisted, input.rows, input.now);
  }

  async stageAdminProvidedArtifact(input: {
    batch: StudentCredentialExecutionBatch;
    rows: StudentCredentialExecutionRow[];
    sharedPassword: string;
    now: Date;
  }): Promise<StudentCredentialSecretArtifact> {
    const hasPointer = input.batch.secretArtifactFileId !== null;
    const hasAnyMetadata =
      hasPointer ||
      input.batch.secretArtifactVersion !== null ||
      input.batch.secretArtifactStagedAt !== null ||
      input.batch.secretArtifactExpiresAt !== null;
    if (hasPointer) {
      const artifact = await this.readAndVerify(
        input.batch,
        input.rows,
        input.now,
      );
      assertExactAdminProvidedPassword(artifact, input.sharedPassword);
      return artifact;
    }
    if (
      hasAnyMetadata ||
      input.batch.credentialMode !==
        StudentCredentialMode.SHARED_ADMIN_PROVIDED ||
      input.batch.status !== StudentCredentialBatchStatus.PENDING ||
      input.batch.startedAt !== null ||
      input.batch.generatedRows !== 0 ||
      input.batch.skippedRows !== 0 ||
      input.batch.failedRows !== 0 ||
      input.rows.some(
        (row) => row.status !== StudentCredentialRowStatus.PENDING,
      )
    ) {
      throw new StudentCredentialSecretArtifactException(
        STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
      );
    }

    const artifact = buildAdminProvidedArtifact(
      input.batch,
      input.rows,
      input.sharedPassword,
      input.now,
    );
    const body = Buffer.from(JSON.stringify(artifact), 'utf8');
    if (body.byteLength > STUDENT_CREDENTIAL_SECRET_ARTIFACT_MAX_BYTES) {
      throw new StudentCredentialSecretArtifactException(
        STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
      );
    }
    const checksumSha256 = createHash('sha256').update(body).digest('hex');
    const objectKey = studentCredentialSecretArtifactObjectKey({
      schoolId: input.batch.schoolId,
      batchId: input.batch.id,
    });
    const stored = await this.storage.saveObject({
      objectKey,
      body,
      sizeBytes: body.byteLength,
      visibility: FileVisibility.PRIVATE,
      contentType: STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME,
      metadata: {
        purpose: 'student-credential-secret-artifact',
        batchId: input.batch.id,
        artifactVersion: String(STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION),
        sha256: checksumSha256,
      },
    });
    try {
      await this.repository.attachPendingAdminProvidedSecretArtifact({
        batchId: input.batch.id,
        schoolId: input.batch.schoolId,
        organizationId: input.batch.organizationId,
        uploaderId: input.batch.createdById,
        bucket: stored.bucket,
        objectKey,
        originalName: STUDENT_CREDENTIAL_SECRET_ARTIFACT_ORIGINAL_NAME,
        mimeType: STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME,
        sizeBytes: BigInt(body.byteLength),
        checksumSha256,
        artifactVersion: STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION,
        stagedAt: input.now,
        expiresAt: new Date(
          input.now.getTime() + STUDENT_CREDENTIAL_SECRET_ARTIFACT_TTL_MS,
        ),
      });
    } catch {
      const persisted = await this.repository
        .findExecutionBatchById(input.batch.id)
        .catch(() => null);
      if (persisted?.secretArtifactFileId) {
        const existing = await this.readAndVerify(
          persisted,
          input.rows,
          input.now,
        );
        assertExactAdminProvidedPassword(existing, input.sharedPassword);
        return existing;
      }
      await this.storage
        .deleteObjectAndConfirmAbsent({ bucket: stored.bucket, objectKey })
        .catch(() => undefined);
      throw new StudentCredentialSecretArtifactException(
        STUDENT_CREDENTIAL_SECRET_ARTIFACT_UNAVAILABLE_CODE,
      );
    }
    const persisted = await this.repository.findExecutionBatchById(
      input.batch.id,
    );
    if (!persisted) {
      throw new StudentCredentialExecutionInvariantException(
        'artifact_batch_disappeared',
      );
    }
    const verified = await this.readAndVerify(persisted, input.rows, input.now);
    assertExactAdminProvidedPassword(verified, input.sharedPassword);
    return verified;
  }

  async readAndVerify(
    batch: StudentCredentialExecutionBatch,
    rows: StudentCredentialExecutionRow[],
    now: Date,
  ): Promise<StudentCredentialSecretArtifact> {
    const file = batch.secretArtifactFile;
    const expectedObjectKey = studentCredentialSecretArtifactObjectKey({
      schoolId: batch.schoolId,
      batchId: batch.id,
    });
    if (
      !batch.secretArtifactFileId ||
      !file ||
      batch.secretArtifactVersion !==
        STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION ||
      !batch.secretArtifactStagedAt ||
      !batch.secretArtifactExpiresAt ||
      batch.secretArtifactExpiresAt.getTime() <= now.getTime() ||
      file.id !== batch.secretArtifactFileId ||
      file.schoolId !== batch.schoolId ||
      file.organizationId !== batch.organizationId ||
      file.uploaderId !== batch.createdById ||
      file.visibility !== FileVisibility.PRIVATE ||
      file.bucket !== this.storage.resolveBucket(FileVisibility.PRIVATE) ||
      file.objectKey !== expectedObjectKey ||
      file.mimeType !== STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME ||
      file.deletedAt !== null ||
      file.checksumSha256 === null ||
      file.sizeBytes <= 0n ||
      file.sizeBytes > BigInt(STUDENT_CREDENTIAL_SECRET_ARTIFACT_MAX_BYTES)
    ) {
      throw new StudentCredentialSecretArtifactException(
        batch.secretArtifactExpiresAt &&
          batch.secretArtifactExpiresAt.getTime() <= now.getTime()
          ? STUDENT_CREDENTIAL_SECRET_ARTIFACT_EXPIRED_CODE
          : STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
      );
    }

    try {
      const stat = await this.storage.statObject({
        bucket: file.bucket,
        objectKey: file.objectKey,
      });
      if (
        stat.size !== Number(file.sizeBytes) ||
        stat.size > STUDENT_CREDENTIAL_SECRET_ARTIFACT_MAX_BYTES ||
        stat.contentType !== STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME ||
        metadataValue(stat.metadata, 'purpose') !==
          'student-credential-secret-artifact' ||
        metadataValue(stat.metadata, 'batchId') !== batch.id ||
        metadataValue(stat.metadata, 'artifactVersion') !==
          String(STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION) ||
        metadataValue(stat.metadata, 'sha256') !== file.checksumSha256
      ) {
        throw new StudentCredentialSecretArtifactException(
          STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
        );
      }
      const stream = await this.storage.getObject({
        bucket: file.bucket,
        objectKey: file.objectKey,
      });
      const body = await readBounded(stream);
      const checksum = createHash('sha256').update(body).digest('hex');
      if (checksum !== file.checksumSha256) {
        throw new StudentCredentialSecretArtifactException(
          STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
        );
      }
      return parseAndVerifyArtifact(body, batch, rows);
    } catch (error) {
      if (error instanceof StudentCredentialSecretArtifactException)
        throw error;
      if (isObjectStorageNotFoundError(error)) {
        throw new StudentCredentialSecretArtifactException(
          STUDENT_CREDENTIAL_SECRET_ARTIFACT_UNAVAILABLE_CODE,
        );
      }
      throw error;
    }
  }

  async deletePotentialOrphanSecretArtifact(input: {
    schoolId: string;
    batchId: string;
  }): Promise<void> {
    await this.storage.deleteObjectAndConfirmAbsent({
      bucket: this.storage.resolveBucket(FileVisibility.PRIVATE),
      objectKey: studentCredentialSecretArtifactObjectKey(input),
    });
  }
}

function metadataValue(
  metadata: Readonly<Record<string, string>>,
  expectedKey: string,
): string | undefined {
  const normalizedExpected = expectedKey.toLowerCase();
  return Object.entries(metadata).find(
    ([key]) => key.toLowerCase() === normalizedExpected,
  )?.[1];
}

function buildArtifact(
  batch: StudentCredentialExecutionBatch,
  rows: StudentCredentialExecutionRow[],
  now: Date,
): StudentCredentialSecretArtifact {
  assertArtifactRows(batch, rows);
  const used = new Set<string>();
  let entries: StudentCredentialArtifactEntry[];
  switch (batch.credentialMode) {
    case StudentCredentialMode.UNIQUE_GENERATED:
      entries = rows.map((row) => ({
        rowId: row.id,
        studentId: row.studentId,
        userId: row.userId!,
        temporaryPassword: generateUniquePassword(used),
      }));
      break;
    case StudentCredentialMode.SHARED_TEMPORARY: {
      const sharedPassword = generateUniquePassword(used);
      entries = rows.map((row) => ({
        rowId: row.id,
        studentId: row.studentId,
        userId: row.userId!,
        temporaryPassword: sharedPassword,
      }));
      break;
    }
    case StudentCredentialMode.SHARED_ADMIN_PROVIDED:
      throw new StudentCredentialSecretArtifactException(
        STUDENT_CREDENTIAL_SECRET_ARTIFACT_UNAVAILABLE_CODE,
      );
  }
  return {
    version: STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION,
    batchId: batch.id,
    credentialMode: mapStudentCredentialModeToApi(batch.credentialMode),
    createdAt: now.toISOString(),
    entries,
  };
}

function buildAdminProvidedArtifact(
  batch: StudentCredentialExecutionBatch,
  rows: StudentCredentialExecutionRow[],
  sharedPassword: string,
  now: Date,
): StudentCredentialSecretArtifact {
  assertArtifactRows(batch, rows);
  return {
    version: STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION,
    batchId: batch.id,
    credentialMode: 'shared_admin_provided',
    createdAt: now.toISOString(),
    entries: rows.map((row) => ({
      rowId: row.id,
      studentId: row.studentId,
      userId: row.userId!,
      temporaryPassword: sharedPassword,
    })),
  };
}

function assertArtifactRows(
  batch: StudentCredentialExecutionBatch,
  rows: StudentCredentialExecutionRow[],
): void {
  if (rows.length !== batch.totalRows || rows.some((row) => !row.userId)) {
    throw new StudentCredentialExecutionInvariantException(
      'artifact_row_set_invalid',
    );
  }
}

function assertExactAdminProvidedPassword(
  artifact: StudentCredentialSecretArtifact,
  sharedPassword: string,
): void {
  if (
    artifact.credentialMode !== 'shared_admin_provided' ||
    artifact.entries.some((entry) => entry.temporaryPassword !== sharedPassword)
  ) {
    throw new StudentCredentialSecretArtifactException(
      STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
    );
  }
}

function generateUniquePassword(used: Set<string>): string {
  for (
    let attempt = 0;
    attempt < MAX_PASSWORD_COLLISION_ATTEMPTS;
    attempt += 1
  ) {
    const password = generateTemporaryPassword();
    if (!used.has(password)) {
      used.add(password);
      return password;
    }
  }
  throw new StudentCredentialExecutionInvariantException(
    'password_collision_retry_exhausted',
  );
}

async function readBounded(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream as AsyncIterable<unknown>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.byteLength;
    if (size > STUDENT_CREDENTIAL_SECRET_ARTIFACT_MAX_BYTES) {
      stream.destroy();
      throw new StudentCredentialSecretArtifactException(
        STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function parseAndVerifyArtifact(
  body: Buffer,
  batch: StudentCredentialExecutionBatch,
  rows: StudentCredentialExecutionRow[],
): StudentCredentialSecretArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new StudentCredentialSecretArtifactException(
      STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
    );
  }
  if (!isExactArtifact(parsed)) {
    throw new StudentCredentialSecretArtifactException(
      STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
    );
  }
  if (
    parsed.batchId !== batch.id ||
    parsed.credentialMode !==
      mapStudentCredentialModeToApi(batch.credentialMode) ||
    parsed.createdAt !== batch.secretArtifactStagedAt?.toISOString() ||
    parsed.entries.length !== rows.length
  ) {
    throw new StudentCredentialSecretArtifactException(
      STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
    );
  }
  const expected = new Map(rows.map((row) => [row.id, row]));
  const seenRows = new Set<string>();
  const seenStudents = new Set<string>();
  const seenUsers = new Set<string>();
  for (const entry of parsed.entries) {
    const row = expected.get(entry.rowId);
    if (
      !row ||
      row.studentId !== entry.studentId ||
      row.userId !== entry.userId ||
      entry.temporaryPassword.length === 0 ||
      seenRows.has(entry.rowId) ||
      seenStudents.has(entry.studentId) ||
      seenUsers.has(entry.userId)
    ) {
      throw new StudentCredentialSecretArtifactException(
        STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
      );
    }
    seenRows.add(entry.rowId);
    seenStudents.add(entry.studentId);
    seenUsers.add(entry.userId);
  }
  const distinctPasswords = new Set(
    parsed.entries.map((entry) => entry.temporaryPassword),
  ).size;
  if (
    (batch.credentialMode === StudentCredentialMode.SHARED_TEMPORARY &&
      distinctPasswords !== 1) ||
    (batch.credentialMode === StudentCredentialMode.SHARED_ADMIN_PROVIDED &&
      distinctPasswords !== 1) ||
    (batch.credentialMode === StudentCredentialMode.UNIQUE_GENERATED &&
      distinctPasswords !== parsed.entries.length)
  ) {
    throw new StudentCredentialSecretArtifactException(
      STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
    );
  }
  return parsed;
}

function isExactArtifact(
  value: unknown,
): value is StudentCredentialSecretArtifact {
  if (
    !isRecordWithExactKeys(value, [
      'version',
      'batchId',
      'credentialMode',
      'createdAt',
      'entries',
    ])
  ) {
    return false;
  }
  if (
    value.version !== STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION ||
    typeof value.batchId !== 'string' ||
    (value.credentialMode !== 'unique_generated' &&
      value.credentialMode !== 'shared_temporary' &&
      value.credentialMode !== 'shared_admin_provided') ||
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Array.isArray(value.entries)
  ) {
    return false;
  }
  return value.entries.every(
    (entry) =>
      isRecordWithExactKeys(entry, [
        'rowId',
        'studentId',
        'userId',
        'temporaryPassword',
      ]) &&
      typeof entry.rowId === 'string' &&
      typeof entry.studentId === 'string' &&
      typeof entry.userId === 'string' &&
      typeof entry.temporaryPassword === 'string',
  );
}

function isRecordWithExactKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

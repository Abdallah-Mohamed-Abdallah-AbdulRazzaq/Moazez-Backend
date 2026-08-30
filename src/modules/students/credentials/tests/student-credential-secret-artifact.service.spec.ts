/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- focused storage and repository Jest doubles capture exact artifact bytes and metadata. */
import {
  FileVisibility,
  OrganizationStatus,
  SchoolStatus,
  StudentCredentialAudienceMode,
  StudentCredentialBatchStatus,
  StudentCredentialMode,
  StudentCredentialRowStatus,
  UserType,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { StudentCredentialSecretArtifactService } from '../application/student-credential-secret-artifact.service';
import { STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME } from '../domain/student-credential.constants';
import {
  StudentCredentialBatchRepository,
  type StudentCredentialExecutionBatch,
  type StudentCredentialExecutionRow,
} from '../infrastructure/student-credential-batch.repository';

describe('StudentCredentialSecretArtifactService', () => {
  const adminPassword = 'F2Admin!Pass123';
  it.each([
    [StudentCredentialMode.UNIQUE_GENERATED, false],
    [StudentCredentialMode.SHARED_TEMPORARY, true],
  ])(
    'stages, attaches, reads back, and verifies %s credentials before execution',
    async (credentialMode, shared) => {
      const fixture = createFixture(credentialMode);
      const artifact = await fixture.service.ensureArtifact({
        batch: fixture.initialBatch,
        rows: fixture.rows,
        now: fixture.now,
      });

      expect(fixture.storage.saveObject).toHaveBeenCalledTimes(1);
      expect(fixture.storage.saveObject).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: FileVisibility.PRIVATE,
          contentType: STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME,
          metadata: expect.objectContaining({
            purpose: 'student-credential-secret-artifact',
            batchId: fixture.initialBatch.id,
            artifactVersion: '1',
            sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
          }),
        }),
      );
      expect(fixture.repository.attachSecretArtifact).toHaveBeenCalledTimes(1);
      expect(
        fixture.storage.saveObject.mock.invocationCallOrder[0],
      ).toBeLessThan(
        fixture.repository.attachSecretArtifact.mock.invocationCallOrder[0],
      );
      expect(fixture.storage.statObject).toHaveBeenCalledTimes(1);
      expect(fixture.storage.getObject).toHaveBeenCalledTimes(1);
      expect(artifact.entries).toHaveLength(2);
      expect(
        artifact.entries[0].temporaryPassword ===
          artifact.entries[1].temporaryPassword,
      ).toBe(shared);
      expect(Object.keys(artifact).sort()).toEqual(
        ['batchId', 'createdAt', 'credentialMode', 'entries', 'version'].sort(),
      );
      expect(Object.keys(artifact.entries[0]).sort()).toEqual(
        ['rowId', 'studentId', 'temporaryPassword', 'userId'].sort(),
      );
      const attachPayload = JSON.stringify(
        fixture.repository.attachSecretArtifact.mock.calls[0][0],
        (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      );
      expect(attachPayload).not.toContain(
        artifact.entries[0].temporaryPassword,
      );
    },
  );

  it('reuses committed staging metadata and never regenerates credentials', async () => {
    const fixture = createFixture(StudentCredentialMode.UNIQUE_GENERATED);
    const first = await fixture.service.ensureArtifact({
      batch: fixture.initialBatch,
      rows: fixture.rows,
      now: fixture.now,
    });
    fixture.storage.saveObject.mockClear();

    const second = await fixture.service.ensureArtifact({
      batch: fixture.persistedBatch(),
      rows: fixture.rows,
      now: new Date(fixture.now.getTime() + 1000),
    });

    expect(second).toEqual(first);
    expect(fixture.storage.saveObject).not.toHaveBeenCalled();
    expect(fixture.repository.attachSecretArtifact).toHaveBeenCalledTimes(1);
  });

  it('pre-stages the exact administrator password on a PENDING batch and verifies it before returning', async () => {
    const fixture = createFixture(StudentCredentialMode.SHARED_ADMIN_PROVIDED, {
      status: StudentCredentialBatchStatus.PENDING,
      startedAt: null,
    });

    const artifact = await fixture.service.stageAdminProvidedArtifact({
      batch: fixture.initialBatch,
      rows: fixture.rows,
      sharedPassword: adminPassword,
      now: fixture.now,
    });

    expect(fixture.repository.attachSecretArtifact).not.toHaveBeenCalled();
    expect(
      fixture.repository.attachPendingAdminProvidedSecretArtifact,
    ).toHaveBeenCalledTimes(1);
    expect(artifact).toMatchObject({
      version: 1,
      credentialMode: 'shared_admin_provided',
    });
    expect(
      new Set(artifact.entries.map((entry) => entry.temporaryPassword)),
    ).toEqual(new Set([adminPassword]));
    expect(fixture.storage.saveObject).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: FileVisibility.PRIVATE,
        contentType: STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME,
      }),
    );
  });

  it('never generates a replacement for custom mode without a persisted pointer', async () => {
    const fixture = createFixture(StudentCredentialMode.SHARED_ADMIN_PROVIDED);

    await expect(
      fixture.service.ensureArtifact({
        batch: fixture.initialBatch,
        rows: fixture.rows,
        now: fixture.now,
      }),
    ).rejects.toMatchObject({
      code: 'students.credentials.secret_artifact_unavailable',
    });
    expect(fixture.storage.saveObject).not.toHaveBeenCalled();
  });

  it('fails closed rather than overwriting a concurrently staged different administrator password', async () => {
    const fixture = createFixture(StudentCredentialMode.SHARED_ADMIN_PROVIDED, {
      status: StudentCredentialBatchStatus.PENDING,
      startedAt: null,
    });
    await fixture.service.stageAdminProvidedArtifact({
      batch: fixture.initialBatch,
      rows: fixture.rows,
      sharedPassword: adminPassword,
      now: fixture.now,
    });
    fixture.storage.saveObject.mockClear();

    await expect(
      fixture.service.stageAdminProvidedArtifact({
        batch: fixture.persistedBatch(),
        rows: fixture.rows,
        sharedPassword: 'Different!Pass123',
        now: fixture.now,
      }),
    ).rejects.toMatchObject({
      code: 'students.credentials.secret_artifact_invalid',
    });
    expect(fixture.storage.saveObject).not.toHaveBeenCalled();
  });

  it('fails closed when a custom artifact has expired', async () => {
    const fixture = createFixture(StudentCredentialMode.SHARED_ADMIN_PROVIDED, {
      status: StudentCredentialBatchStatus.PENDING,
      startedAt: null,
    });
    await fixture.service.stageAdminProvidedArtifact({
      batch: fixture.initialBatch,
      rows: fixture.rows,
      sharedPassword: adminPassword,
      now: fixture.now,
    });

    await expect(
      fixture.service.ensureArtifact({
        batch: fixture.persistedBatch(),
        rows: fixture.rows,
        now: new Date('2026-08-29T10:00:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'students.credentials.secret_artifact_expired',
    });
    expect(fixture.storage.saveObject).toHaveBeenCalledTimes(1);
  });

  it('confirms deterministic orphan absence when a custom pending attach fails', async () => {
    const fixture = createFixture(StudentCredentialMode.SHARED_ADMIN_PROVIDED, {
      status: StudentCredentialBatchStatus.PENDING,
      startedAt: null,
    });
    fixture.repository.attachPendingAdminProvidedSecretArtifact.mockRejectedValueOnce(
      new Error('database_attach_failed'),
    );
    fixture.repository.findExecutionBatchById.mockResolvedValueOnce(
      fixture.initialBatch,
    );

    await expect(
      fixture.service.stageAdminProvidedArtifact({
        batch: fixture.initialBatch,
        rows: fixture.rows,
        sharedPassword: adminPassword,
        now: fixture.now,
      }),
    ).rejects.toMatchObject({
      code: 'students.credentials.secret_artifact_unavailable',
    });
    expect(fixture.storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledWith({
      bucket: 'private-bucket',
      objectKey:
        'schools/school-1/files/student-credential-batch-batch-1-v1.json',
    });
  });

  it('fails closed when readback bytes do not match persisted checksum', async () => {
    const fixture = createFixture(StudentCredentialMode.UNIQUE_GENERATED);
    await fixture.service.ensureArtifact({
      batch: fixture.initialBatch,
      rows: fixture.rows,
      now: fixture.now,
    });
    fixture.storage.getObject.mockResolvedValueOnce(
      Readable.from([Buffer.from('{"tampered":true}')]),
    );

    await expect(
      fixture.service.ensureArtifact({
        batch: fixture.persistedBatch(),
        rows: fixture.rows,
        now: fixture.now,
      }),
    ).rejects.toMatchObject({
      code: 'students.credentials.secret_artifact_invalid',
    });
    expect(fixture.storage.saveObject).toHaveBeenCalledTimes(1);
  });

  it('fails closed when persisted storage identity does not match the private deterministic artifact contract', async () => {
    const fixture = createFixture(StudentCredentialMode.UNIQUE_GENERATED);
    await fixture.service.ensureArtifact({
      batch: fixture.initialBatch,
      rows: fixture.rows,
      now: fixture.now,
    });
    const persisted = fixture.persistedBatch();
    persisted.secretArtifactFile!.objectKey = 'unexpected/key.json';

    await expect(
      fixture.service.ensureArtifact({
        batch: persisted,
        rows: fixture.rows,
        now: fixture.now,
      }),
    ).rejects.toMatchObject({
      code: 'students.credentials.secret_artifact_invalid',
    });
    expect(fixture.storage.getObject).toHaveBeenCalledTimes(1);
  });

  it('never regenerates when row progress exists without a committed artifact pointer', async () => {
    const fixture = createFixture(StudentCredentialMode.UNIQUE_GENERATED);
    await expect(
      fixture.service.ensureArtifact({
        batch: batchFixture(
          StudentCredentialMode.UNIQUE_GENERATED,
          fixture.now,
          {
            generatedRows: 1,
          },
        ),
        rows: [
          { ...fixture.rows[0], status: StudentCredentialRowStatus.GENERATED },
          fixture.rows[1],
        ],
        now: fixture.now,
      }),
    ).rejects.toMatchObject({
      code: 'students.credentials.secret_artifact_invalid',
    });
    expect(fixture.storage.saveObject).not.toHaveBeenCalled();
  });

  it('rethrows temporary storage read failures for BullMQ retry', async () => {
    const fixture = createFixture(StudentCredentialMode.UNIQUE_GENERATED);
    await fixture.service.ensureArtifact({
      batch: fixture.initialBatch,
      rows: fixture.rows,
      now: fixture.now,
    });
    fixture.storage.statObject.mockRejectedValueOnce(
      new Error('storage_temporarily_unavailable'),
    );

    await expect(
      fixture.service.ensureArtifact({
        batch: fixture.persistedBatch(),
        rows: fixture.rows,
        now: fixture.now,
      }),
    ).rejects.toThrow('storage_temporarily_unavailable');
    expect(fixture.storage.saveObject).toHaveBeenCalledTimes(1);
  });

  it('deletes only the deterministic private potential-orphan object', async () => {
    const fixture = createFixture(StudentCredentialMode.UNIQUE_GENERATED);
    await fixture.service.deletePotentialOrphanSecretArtifact({
      schoolId: 'school-1',
      batchId: 'batch-1',
    });
    expect(fixture.storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledWith({
      bucket: 'private-bucket',
      objectKey:
        'schools/school-1/files/student-credential-batch-batch-1-v1.json',
    });
  });
});

function createFixture(
  credentialMode: StudentCredentialMode,
  batchOverrides: Partial<StudentCredentialExecutionBatch> = {},
) {
  const now = new Date('2026-08-27T10:00:00.000Z');
  let storedBody = Buffer.alloc(0);
  let attached:
    | Parameters<StudentCredentialBatchRepository['attachSecretArtifact']>[0]
    | Parameters<
        StudentCredentialBatchRepository['attachPendingAdminProvidedSecretArtifact']
      >[0]
    | null = null;
  const initialBatch = batchFixture(credentialMode, now, batchOverrides);
  const rows = rowFixtures();
  const repository = {
    attachSecretArtifact: jest.fn(async (input) => {
      attached = input;
      return 'file-1';
    }),
    attachPendingAdminProvidedSecretArtifact: jest.fn(async (input) => {
      attached = input;
      return 'file-1';
    }),
    findExecutionBatchById: jest.fn(async () => persistedBatch()),
  };
  const storage = {
    saveObject: jest.fn(async (input: { body: Buffer }) => {
      storedBody = Buffer.from(input.body);
      return { bucket: 'private-bucket', etag: 'etag' };
    }),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    deleteObjectAndConfirmAbsent: jest.fn().mockResolvedValue(undefined),
    statObject: jest.fn(async () => ({
      size: storedBody.byteLength,
      etag: 'etag',
      contentType: STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME,
      metadata: {
        purpose: 'student-credential-secret-artifact',
        batchId: initialBatch.id,
        artifactVersion: '1',
        sha256: createHash('sha256').update(storedBody).digest('hex'),
      },
      lastModified: now,
      generation: null,
      version: null,
    })),
    getObject: jest.fn(async () => Readable.from([storedBody])),
    resolveBucket: jest.fn(() => 'private-bucket'),
  };
  function persistedBatch(): StudentCredentialExecutionBatch {
    if (!attached) throw new Error('artifact_not_attached');
    return {
      ...initialBatch,
      secretArtifactFileId: 'file-1',
      secretArtifactVersion: attached.artifactVersion,
      secretArtifactStagedAt: attached.stagedAt,
      secretArtifactExpiresAt: attached.expiresAt,
      secretArtifactFile: {
        id: 'file-1',
        schoolId: initialBatch.schoolId,
        organizationId: initialBatch.organizationId,
        uploaderId: initialBatch.createdById,
        bucket: 'private-bucket',
        objectKey: attached.objectKey,
        originalName: attached.originalName,
        mimeType: attached.mimeType,
        sizeBytes: BigInt(storedBody.byteLength),
        checksumSha256: createHash('sha256').update(storedBody).digest('hex'),
        visibility: FileVisibility.PRIVATE,
        deletedAt: null,
      },
    };
  }
  return {
    now,
    initialBatch,
    rows,
    repository,
    storage,
    persistedBatch,
    service: new StudentCredentialSecretArtifactService(
      repository as unknown as StudentCredentialBatchRepository,
      storage as unknown as StorageService,
    ),
  };
}

function batchFixture(
  credentialMode: StudentCredentialMode,
  now: Date,
  overrides: Partial<StudentCredentialExecutionBatch> = {},
): StudentCredentialExecutionBatch {
  return {
    id: 'batch-1',
    schoolId: 'school-1',
    organizationId: 'organization-1',
    audienceMode: StudentCredentialAudienceMode.SELECTED_STUDENTS,
    credentialMode,
    sourceRegistrationBatchId: null,
    academicYearId: null,
    stageId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
    secretArtifactFileId: null,
    secretArtifactVersion: null,
    secretArtifactStagedAt: null,
    secretArtifactExpiresAt: null,
    secretArtifactFile: null,
    status: StudentCredentialBatchStatus.PROCESSING,
    totalRows: 2,
    generatedRows: 0,
    skippedRows: 0,
    failedRows: 0,
    createdById: 'actor-1',
    createdBy: { userType: UserType.SCHOOL_USER },
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    completedAt: null,
    school: {
      id: 'school-1',
      organizationId: 'organization-1',
      status: SchoolStatus.ACTIVE,
      deletedAt: null,
      organization: {
        id: 'organization-1',
        status: OrganizationStatus.ACTIVE,
        deletedAt: null,
      },
    },
    ...overrides,
  };
}

function rowFixtures(): StudentCredentialExecutionRow[] {
  return [1, 2].map((number) => ({
    id: `row-${number}`,
    schoolId: 'school-1',
    batchId: 'batch-1',
    studentId: `student-${number}`,
    userId: `user-${number}`,
    status: StudentCredentialRowStatus.PENDING,
    credentialVersionBefore: 0,
    credentialVersionAfter: null,
    generatedAt: null,
  }));
}

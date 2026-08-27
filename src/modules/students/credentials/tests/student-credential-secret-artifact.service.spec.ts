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
});

function createFixture(credentialMode: StudentCredentialMode) {
  const now = new Date('2026-08-27T10:00:00.000Z');
  let storedBody = Buffer.alloc(0);
  let attached:
    | Parameters<StudentCredentialBatchRepository['attachSecretArtifact']>[0]
    | null = null;
  const initialBatch = batchFixture(credentialMode, now);
  const rows = rowFixtures();
  const repository = {
    attachSecretArtifact: jest.fn(async (input) => {
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

import {
  FileVisibility,
  OrganizationStatus,
  SchoolStatus,
  StudentCredentialAudienceMode,
  StudentCredentialBatchStatus,
  StudentCredentialMode,
  UserType,
} from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { StudentCredentialSecretArtifactCleanupService } from '../application/student-credential-secret-artifact-cleanup.service';
import { STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME } from '../domain/student-credential.constants';
import { studentCredentialSecretArtifactObjectKey } from '../domain/student-credential-secret-artifact-key';
import {
  StudentCredentialBatchRepository,
  type StudentCredentialSecretArtifactCleanupCandidate,
} from '../infrastructure/student-credential-batch.repository';

describe('StudentCredentialSecretArtifactCleanupService', () => {
  it('deletes confirmed expired bytes before soft-deleting metadata and auditing', async () => {
    const fixture = createFixture();

    await expect(fixture.service.reconcile(NOW)).resolves.toEqual({
      scanned: 1,
      cleaned: 1,
      blockedInvariant: 0,
      lostRace: 0,
    });

    expect(fixture.storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledWith({
      bucket: 'private-bucket',
      objectKey: studentCredentialSecretArtifactObjectKey({
        schoolId: SCHOOL_ID,
        batchId: BATCH_ID,
      }),
    });
    expect(
      fixture.storage.deleteObjectAndConfirmAbsent.mock.invocationCallOrder[0],
    ).toBeLessThan(
      fixture.repository.commitExpiredSecretArtifactCleanup.mock
        .invocationCallOrder[0],
    );
    expect(
      fixture.repository.commitExpiredSecretArtifactCleanup,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: BATCH_ID,
        fileId: 'file-1',
        artifactVersion: 1,
        cleanedAt: NOW,
      }),
    );
  });

  it('commits metadata cleanup when the object is already confirmed absent', async () => {
    const fixture = createFixture();
    fixture.storage.deleteObjectAndConfirmAbsent.mockResolvedValue(undefined);

    await expect(fixture.service.reconcile(NOW)).resolves.toMatchObject({
      cleaned: 1,
    });
    expect(
      fixture.repository.commitExpiredSecretArtifactCleanup,
    ).toHaveBeenCalledTimes(1);
  });

  it('fails closed without deleting when storage identity is corrupted', async () => {
    const fixture = createFixture({ objectKey: 'foreign/object.json' });
    await expect(fixture.service.reconcile(NOW)).resolves.toMatchObject({
      blockedInvariant: 1,
      cleaned: 0,
    });
    expect(fixture.storage.deleteObjectAndConfirmAbsent).not.toHaveBeenCalled();
    expect(
      fixture.repository.commitExpiredSecretArtifactCleanup,
    ).not.toHaveBeenCalled();
  });

  it.each([
    StudentCredentialBatchStatus.PENDING,
    StudentCredentialBatchStatus.PROCESSING,
  ])('does not clean a non-terminal %s candidate', async (status) => {
    const fixture = createFixture({}, [cleanupCandidate({}, { status })]);
    await expect(fixture.service.reconcile(NOW)).resolves.toMatchObject({
      blockedInvariant: 1,
      cleaned: 0,
    });
    expect(fixture.storage.deleteObjectAndConfirmAbsent).not.toHaveBeenCalled();
  });

  it('does not clean a linked artifact before its expiry', async () => {
    const fixture = createFixture({}, [
      cleanupCandidate(
        {},
        {
          secretArtifactExpiresAt: new Date('2026-08-30T12:00:00.000Z'),
        },
      ),
    ]);
    await expect(fixture.service.reconcile(NOW)).resolves.toMatchObject({
      blockedInvariant: 1,
      cleaned: 0,
    });
    expect(fixture.storage.deleteObjectAndConfirmAbsent).not.toHaveBeenCalled();
  });

  it.each([
    StudentCredentialBatchStatus.COMPLETED,
    StudentCredentialBatchStatus.PARTIAL_FAILED,
    StudentCredentialBatchStatus.FAILED,
  ])(
    'cleans an expired linked artifact for terminal status %s',
    async (status) => {
      const fixture = createFixture({}, [cleanupCandidate({}, { status })]);
      await expect(fixture.service.reconcile(NOW)).resolves.toMatchObject({
        cleaned: 1,
        blockedInvariant: 0,
      });
    },
  );

  it('leaves metadata durable when storage absence cannot be confirmed', async () => {
    const fixture = createFixture();
    fixture.storage.deleteObjectAndConfirmAbsent.mockRejectedValue(
      new Error('storage_temporarily_unavailable'),
    );
    await expect(fixture.service.reconcile(NOW)).rejects.toThrow(
      'storage_temporarily_unavailable',
    );
    expect(
      fixture.repository.commitExpiredSecretArtifactCleanup,
    ).not.toHaveBeenCalled();
  });

  it('retries safely after object deletion succeeds but the DB cleanup fails', async () => {
    const fixture = createFixture();
    fixture.repository.commitExpiredSecretArtifactCleanup
      .mockRejectedValueOnce(new Error('database_temporarily_unavailable'))
      .mockResolvedValueOnce(true);

    await expect(fixture.service.reconcile(NOW)).rejects.toThrow(
      'database_temporarily_unavailable',
    );
    await expect(fixture.service.reconcile(NOW)).resolves.toMatchObject({
      cleaned: 1,
    });
    expect(fixture.storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledTimes(
      2,
    );
  });

  it('reports a lost race without claiming metadata cleanup', async () => {
    const fixture = createFixture();
    fixture.repository.commitExpiredSecretArtifactCleanup.mockResolvedValue(
      false,
    );
    await expect(fixture.service.reconcile(NOW)).resolves.toMatchObject({
      cleaned: 0,
      lostRace: 1,
    });
  });

  it('is a no-op after the soft-deleted File leaves the candidate scan', async () => {
    const fixture = createFixture({}, []);
    await expect(fixture.service.reconcile(NOW)).resolves.toEqual({
      scanned: 0,
      cleaned: 0,
      blockedInvariant: 0,
      lostRace: 0,
    });
    expect(fixture.storage.deleteObjectAndConfirmAbsent).not.toHaveBeenCalled();
  });
});

const NOW = new Date('2026-08-29T12:00:00.000Z');
const EXPIRES_AT = new Date('2026-08-28T12:00:00.000Z');
const BATCH_ID = '10000000-0000-4000-8000-000000000001';
const SCHOOL_ID = '20000000-0000-4000-8000-000000000001';
const ORGANIZATION_ID = '30000000-0000-4000-8000-000000000001';
const ACTOR_ID = '40000000-0000-4000-8000-000000000001';

function createFixture(
  fileOverrides: Partial<
    NonNullable<
      StudentCredentialSecretArtifactCleanupCandidate['secretArtifactFile']
    >
  > = {},
  candidates?: StudentCredentialSecretArtifactCleanupCandidate[],
) {
  const candidate = cleanupCandidate(fileOverrides);
  const repository = {
    listExpiredSecretArtifactCleanupCandidates: jest
      .fn()
      .mockResolvedValue(candidates ?? [candidate]),
    commitExpiredSecretArtifactCleanup: jest.fn().mockResolvedValue(true),
  };
  const storage = {
    resolveBucket: jest.fn().mockReturnValue('private-bucket'),
    deleteObjectAndConfirmAbsent: jest.fn().mockResolvedValue(undefined),
  };
  return {
    repository,
    storage,
    service: new StudentCredentialSecretArtifactCleanupService(
      repository as unknown as StudentCredentialBatchRepository,
      storage as unknown as StorageService,
    ),
  };
}

function cleanupCandidate(
  fileOverrides: Partial<
    NonNullable<
      StudentCredentialSecretArtifactCleanupCandidate['secretArtifactFile']
    >
  > = {},
  batchOverrides: Partial<StudentCredentialSecretArtifactCleanupCandidate> = {},
): StudentCredentialSecretArtifactCleanupCandidate {
  const stagedAt = new Date('2026-08-27T12:00:00.000Z');
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
    status: StudentCredentialBatchStatus.COMPLETED,
    totalRows: 1,
    generatedRows: 1,
    skippedRows: 0,
    failedRows: 0,
    createdById: ACTOR_ID,
    createdAt: stagedAt,
    updatedAt: stagedAt,
    startedAt: stagedAt,
    completedAt: stagedAt,
    secretArtifactFileId: 'file-1',
    secretArtifactVersion: 1,
    secretArtifactStagedAt: stagedAt,
    secretArtifactExpiresAt: EXPIRES_AT,
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
      bucket: 'private-bucket',
      objectKey: studentCredentialSecretArtifactObjectKey({
        schoolId: SCHOOL_ID,
        batchId: BATCH_ID,
      }),
      originalName: 'student-credential-secret-v1.json',
      mimeType: STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME,
      sizeBytes: 100n,
      checksumSha256: 'a'.repeat(64),
      visibility: FileVisibility.PRIVATE,
      deletedAt: null,
      ...fileOverrides,
    },
    ...batchOverrides,
  };
}

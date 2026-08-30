/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await -- focused asynchronous Jest doubles preserve operation ordering for the worker contract. */
import {
  OrganizationStatus,
  SchoolStatus,
  StudentCredentialAudienceMode,
  StudentCredentialBatchStatus,
  StudentCredentialMode,
  StudentCredentialRowStatus,
  UserType,
} from '@prisma/client';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { PasswordService } from '../../../iam/auth/domain/password.service';
import { ProcessStudentCredentialBatchUseCase } from '../application/process-student-credential-batch.use-case';
import { StudentCredentialBatchReconciliationService } from '../application/student-credential-batch-reconciliation.service';
import { StudentCredentialSecretArtifactService } from '../application/student-credential-secret-artifact.service';
import { StudentCredentialSecretArtifactException } from '../domain/student-credential.exceptions';
import {
  emptyStudentCredentialRowCounts,
  StudentCredentialBatchRepository,
  type StudentCredentialExecutionBatch,
  type StudentCredentialExecutionRow,
  type StudentCredentialRecoveryCandidate,
} from '../infrastructure/student-credential-batch.repository';

describe('student credential execution', () => {
  it('stages and verifies all plaintext, hashes outside row transactions, and finalizes', async () => {
    const batch = batchFixture();
    const rows = rowFixtures();
    const repository = repositoryFixture(batch, rows);
    const artifact = {
      ensureArtifact: jest.fn().mockResolvedValue({
        version: 1,
        batchId: batch.id,
        credentialMode: 'unique_generated',
        createdAt: batch.createdAt.toISOString(),
        entries: rows.map((row, index) => ({
          rowId: row.id,
          studentId: row.studentId,
          userId: row.userId!,
          temporaryPassword: `password-${index}`,
        })),
      }),
    };
    const password = {
      hash: jest.fn(async (plain: string) => `hash:${plain}`),
    };
    const useCase = new ProcessStudentCredentialBatchUseCase(
      repository as unknown as StudentCredentialBatchRepository,
      artifact as unknown as StudentCredentialSecretArtifactService,
      password as unknown as PasswordService,
    );

    await useCase.execute(batch.id);

    expect(artifact.ensureArtifact).toHaveBeenCalledWith({
      batch,
      rows,
      now: expect.any(Date),
    });
    expect(password.hash).toHaveBeenCalledTimes(2);
    expect(repository.applyCredentialRow).toHaveBeenCalledTimes(2);
    expect(password.hash.mock.invocationCallOrder[0]).toBeLessThan(
      repository.applyCredentialRow.mock.invocationCallOrder[0],
    );
    expect(repository.finalizeBatch).toHaveBeenCalledTimes(1);
  });

  it('hashes shared plaintext independently outside transactions', async () => {
    const batch = batchFixture({
      credentialMode: StudentCredentialMode.SHARED_TEMPORARY,
    });
    const rows = rowFixtures();
    const repository = repositoryFixture(batch, rows);
    const artifact = {
      ensureArtifact: jest.fn().mockResolvedValue({
        version: 1,
        batchId: batch.id,
        credentialMode: 'shared_temporary',
        createdAt: batch.createdAt.toISOString(),
        entries: rows.map((row) => ({
          rowId: row.id,
          studentId: row.studentId,
          userId: row.userId!,
          temporaryPassword: 'same-password',
        })),
      }),
    };
    const password = {
      hash: jest
        .fn()
        .mockResolvedValueOnce('shared-hash-1')
        .mockResolvedValueOnce('shared-hash-2'),
    };
    const useCase = new ProcessStudentCredentialBatchUseCase(
      repository as unknown as StudentCredentialBatchRepository,
      artifact as unknown as StudentCredentialSecretArtifactService,
      password as unknown as PasswordService,
    );

    await useCase.execute(batch.id);

    expect(password.hash).toHaveBeenCalledTimes(2);
    expect(repository.applyCredentialRow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ passwordHash: 'shared-hash-1' }),
    );
    expect(repository.applyCredentialRow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ passwordHash: 'shared-hash-2' }),
    );
  });

  it('applies the exact pre-staged administrator password without regenerating the artifact', async () => {
    const batch = batchFixture({
      credentialMode: StudentCredentialMode.SHARED_ADMIN_PROVIDED,
    });
    const rows = rowFixtures();
    const repository = repositoryFixture(batch, rows);
    const sharedPassword = 'F2Admin!Pass123';
    const artifact = {
      ensureArtifact: jest.fn().mockResolvedValue({
        version: 1,
        batchId: batch.id,
        credentialMode: 'shared_admin_provided',
        createdAt: batch.createdAt.toISOString(),
        entries: rows.map((row) => ({
          rowId: row.id,
          studentId: row.studentId,
          userId: row.userId!,
          temporaryPassword: sharedPassword,
        })),
      }),
    };
    const password = {
      hash: jest
        .fn()
        .mockResolvedValueOnce('admin-hash-1')
        .mockResolvedValueOnce('admin-hash-2'),
    };
    const useCase = new ProcessStudentCredentialBatchUseCase(
      repository as unknown as StudentCredentialBatchRepository,
      artifact as unknown as StudentCredentialSecretArtifactService,
      password as unknown as PasswordService,
    );

    await useCase.execute(batch.id);

    expect(artifact.ensureArtifact).toHaveBeenCalledTimes(1);
    expect(password.hash).toHaveBeenNthCalledWith(1, sharedPassword);
    expect(password.hash).toHaveBeenNthCalledWith(2, sharedPassword);
    expect(repository.applyCredentialRow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ passwordHash: 'admin-hash-1' }),
    );
    expect(repository.applyCredentialRow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ passwordHash: 'admin-hash-2' }),
    );
  });

  it('retries only pending custom rows from the same persisted artifact', async () => {
    const batch = batchFixture({
      credentialMode: StudentCredentialMode.SHARED_ADMIN_PROVIDED,
      generatedRows: 1,
    });
    const [generatedRow, pendingRow] = rowFixtures();
    generatedRow.status = StudentCredentialRowStatus.GENERATED;
    const rows = [generatedRow, pendingRow];
    const repository = repositoryFixture(batch, rows);
    const sharedPassword = 'F2Admin!Pass123';
    const artifact = {
      ensureArtifact: jest.fn().mockResolvedValue({
        version: 1,
        batchId: batch.id,
        credentialMode: 'shared_admin_provided',
        createdAt: batch.createdAt.toISOString(),
        entries: rows.map((row) => ({
          rowId: row.id,
          studentId: row.studentId,
          userId: row.userId!,
          temporaryPassword: sharedPassword,
        })),
      }),
    };
    const password = { hash: jest.fn().mockResolvedValue('retry-hash') };
    const useCase = new ProcessStudentCredentialBatchUseCase(
      repository as unknown as StudentCredentialBatchRepository,
      artifact as unknown as StudentCredentialSecretArtifactService,
      password as unknown as PasswordService,
    );

    await useCase.execute(batch.id);

    expect(artifact.ensureArtifact).toHaveBeenCalledWith({
      batch,
      rows,
      now: expect.any(Date),
    });
    expect(password.hash).toHaveBeenCalledTimes(1);
    expect(password.hash).toHaveBeenCalledWith(sharedPassword);
    expect(repository.applyCredentialRow).toHaveBeenCalledTimes(1);
    expect(repository.applyCredentialRow).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: pendingRow.id }),
    );
    expect(repository.finalizeBatch).toHaveBeenCalledTimes(1);
  });

  it('blocks a rogue custom job at claim when no artifact pointer exists', async () => {
    const batch = batchFixture({
      credentialMode: StudentCredentialMode.SHARED_ADMIN_PROVIDED,
      status: StudentCredentialBatchStatus.PENDING,
      startedAt: null,
      secretArtifactFileId: null,
      secretArtifactVersion: null,
      secretArtifactStagedAt: null,
      secretArtifactExpiresAt: null,
    });
    const rows = rowFixtures();
    const repository = repositoryFixture(batch, rows);
    const artifact = { ensureArtifact: jest.fn() };
    const password = { hash: jest.fn() };
    const useCase = new ProcessStudentCredentialBatchUseCase(
      repository as unknown as StudentCredentialBatchRepository,
      artifact as unknown as StudentCredentialSecretArtifactService,
      password as unknown as PasswordService,
    );

    await expect(useCase.execute(batch.id)).resolves.toBeUndefined();

    expect(repository.claimBatch).toHaveBeenCalledTimes(1);
    expect(artifact.ensureArtifact).not.toHaveBeenCalled();
    expect(password.hash).not.toHaveBeenCalled();
    expect(repository.applyCredentialRow).not.toHaveBeenCalled();
  });

  it('terminalizes remaining rows without exposing artifact details on permanent artifact failure', async () => {
    const batch = batchFixture({
      secretArtifactFileId: null,
      secretArtifactVersion: null,
      secretArtifactStagedAt: null,
      secretArtifactExpiresAt: null,
    });
    const repository = repositoryFixture(batch, rowFixtures());
    const artifact = {
      ensureArtifact: jest
        .fn()
        .mockRejectedValue(
          new StudentCredentialSecretArtifactException(
            'students.credentials.secret_artifact_unavailable',
          ),
        ),
      deletePotentialOrphanSecretArtifact: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    const useCase = new ProcessStudentCredentialBatchUseCase(
      repository as unknown as StudentCredentialBatchRepository,
      artifact as unknown as StudentCredentialSecretArtifactService,
      { hash: jest.fn() } as unknown as PasswordService,
    );

    await expect(useCase.execute(batch.id)).resolves.toBeUndefined();
    expect(repository.terminalizeRemainingPendingRows).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: 'students.credentials.secret_artifact_unavailable',
      }),
    );
    expect(repository.applyCredentialRow).not.toHaveBeenCalled();
    expect(artifact.deletePotentialOrphanSecretArtifact).toHaveBeenCalledWith({
      schoolId: batch.schoolId,
      batchId: batch.id,
    });
    expect(
      artifact.deletePotentialOrphanSecretArtifact.mock.invocationCallOrder[0],
    ).toBeLessThan(
      repository.terminalizeRemainingPendingRows.mock.invocationCallOrder[0],
    );
  });

  it('does not terminalize a no-pointer batch when orphan deletion cannot be confirmed', async () => {
    const batch = batchFixture({
      secretArtifactFileId: null,
      secretArtifactVersion: null,
      secretArtifactStagedAt: null,
      secretArtifactExpiresAt: null,
    });
    const repository = repositoryFixture(batch, rowFixtures());
    const artifact = {
      ensureArtifact: jest
        .fn()
        .mockRejectedValue(
          new StudentCredentialSecretArtifactException(
            'students.credentials.secret_artifact_unavailable',
          ),
        ),
      deletePotentialOrphanSecretArtifact: jest
        .fn()
        .mockRejectedValue(new Error('storage_temporarily_unavailable')),
    };
    const useCase = new ProcessStudentCredentialBatchUseCase(
      repository as unknown as StudentCredentialBatchRepository,
      artifact as unknown as StudentCredentialSecretArtifactService,
      { hash: jest.fn() } as unknown as PasswordService,
    );

    await expect(useCase.execute(batch.id)).rejects.toThrow(
      'storage_temporarily_unavailable',
    );
    expect(repository.terminalizeRemainingPendingRows).not.toHaveBeenCalled();
    expect(repository.finalizeBatch).not.toHaveBeenCalled();
  });

  it('deletes a no-pointer orphan before terminalizing an ineligible tenant', async () => {
    const batch = batchFixture({
      secretArtifactFileId: null,
      secretArtifactVersion: null,
      secretArtifactStagedAt: null,
      secretArtifactExpiresAt: null,
      school: {
        ...batchFixture().school,
        status: SchoolStatus.SUSPENDED,
      },
    });
    const repository = repositoryFixture(batch, rowFixtures());
    const artifact = {
      ensureArtifact: jest.fn(),
      deletePotentialOrphanSecretArtifact: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    const useCase = new ProcessStudentCredentialBatchUseCase(
      repository as unknown as StudentCredentialBatchRepository,
      artifact as unknown as StudentCredentialSecretArtifactService,
      { hash: jest.fn() } as unknown as PasswordService,
    );

    await expect(useCase.execute(batch.id)).resolves.toBeUndefined();
    expect(artifact.ensureArtifact).not.toHaveBeenCalled();
    expect(artifact.deletePotentialOrphanSecretArtifact).toHaveBeenCalledWith({
      schoolId: batch.schoolId,
      batchId: batch.id,
    });
    expect(repository.terminalizeRemainingPendingRows).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: 'students.credentials.execution_tenant_ineligible',
      }),
    );
    expect(
      artifact.deletePotentialOrphanSecretArtifact.mock.invocationCallOrder[0],
    ).toBeLessThan(
      repository.terminalizeRemainingPendingRows.mock.invocationCallOrder[0],
    );
  });
});

describe('StudentCredentialBatchReconciliationService', () => {
  it('restores a pending durable batch through the shared files-imports queue', async () => {
    const candidate = recoveryCandidate();
    const repository = {
      listRecoveryCandidates: jest
        .fn()
        .mockResolvedValueOnce([candidate])
        .mockResolvedValue([]),
      terminalizeRemainingPendingRows: jest.fn(),
      finalizeBatch: jest.fn(),
    };
    const bullmq = {
      ensureJobFromPersistedTruth: jest.fn().mockResolvedValue('created'),
    };
    const service = new StudentCredentialBatchReconciliationService(
      repository as unknown as StudentCredentialBatchRepository,
      bullmq as unknown as BullmqService,
      artifactCleanupFixture(),
    );

    await expect(
      service.reconcile(new Date('2026-08-27T11:00:00Z')),
    ).resolves.toMatchObject({
      restored: 1,
      scanned: 1,
    });
    expect(bullmq.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
      'files-imports',
      'execute-student-credential-batch',
      { batchId: 'batch-1' },
      expect.objectContaining({
        jobId: 'student-credential-batch-execution-batch-1',
        attempts: 3,
      }),
    );
  });

  it('fails closed for a persisted PROCESSING row invariant', async () => {
    const candidate = recoveryCandidate();
    candidate.rowCounts[StudentCredentialRowStatus.PENDING] = 0;
    candidate.rowCounts[StudentCredentialRowStatus.PROCESSING] = 2;
    const repository = {
      listRecoveryCandidates: jest.fn().mockResolvedValue([candidate]),
      terminalizeRemainingPendingRows: jest.fn(),
      finalizeBatch: jest.fn(),
    };
    const bullmq = { ensureJobFromPersistedTruth: jest.fn() };
    const service = new StudentCredentialBatchReconciliationService(
      repository as unknown as StudentCredentialBatchRepository,
      bullmq as unknown as BullmqService,
      artifactCleanupFixture(),
    );

    await expect(
      service.reconcile(new Date('2026-08-27T11:00:00Z')),
    ).resolves.toMatchObject({
      blockedInvariant: 1,
    });
    expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('restores a fully staged custom PENDING batch from persisted truth without plaintext queue data', async () => {
    const candidate = recoveryCandidate({
      credentialMode: StudentCredentialMode.SHARED_ADMIN_PROVIDED,
      secretArtifactFileId: 'artifact-file-1',
      secretArtifactVersion: 1,
      secretArtifactStagedAt: new Date('2026-08-27T10:00:00Z'),
      secretArtifactExpiresAt: new Date('2026-08-28T10:00:00Z'),
    });
    const repository = {
      listRecoveryCandidates: jest.fn().mockResolvedValue([candidate]),
      listExecutionRows: jest.fn().mockResolvedValue(rowFixtures()),
      terminalizeRemainingPendingRows: jest.fn(),
      finalizeBatch: jest.fn(),
    };
    const bullmq = {
      ensureJobFromPersistedTruth: jest.fn().mockResolvedValue('created'),
    };
    const artifact = {
      readAndVerify: jest.fn().mockResolvedValue({}),
      deletePotentialOrphanSecretArtifact: jest.fn(),
    };
    const service = new StudentCredentialBatchReconciliationService(
      repository as unknown as StudentCredentialBatchRepository,
      bullmq as unknown as BullmqService,
      artifact as unknown as StudentCredentialSecretArtifactService,
    );

    await expect(
      service.reconcile(new Date('2026-08-27T11:00:00Z')),
    ).resolves.toMatchObject({ restored: 1, scanned: 1 });
    expect(artifact.readAndVerify).toHaveBeenCalledWith(
      candidate,
      expect.any(Array),
      new Date('2026-08-27T11:00:00Z'),
    );
    expect(bullmq.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
      'files-imports',
      'execute-student-credential-batch',
      { batchId: candidate.id },
      expect.any(Object),
    );
  });

  it('preserves a custom PENDING no-pointer crash window without enqueue before expiry', async () => {
    const candidate = recoveryCandidate({
      credentialMode: StudentCredentialMode.SHARED_ADMIN_PROVIDED,
    });
    const repository = {
      listRecoveryCandidates: jest.fn().mockResolvedValue([candidate]),
      terminalizeRemainingPendingRows: jest.fn(),
      finalizeBatch: jest.fn(),
    };
    const bullmq = { ensureJobFromPersistedTruth: jest.fn() };
    const deletePotentialOrphanSecretArtifact = jest.fn();
    const artifact = {
      readAndVerify: jest.fn().mockResolvedValue({}),
      deletePotentialOrphanSecretArtifact,
    } as unknown as StudentCredentialSecretArtifactService;
    const service = new StudentCredentialBatchReconciliationService(
      repository as unknown as StudentCredentialBatchRepository,
      bullmq as unknown as BullmqService,
      artifact,
    );

    await expect(
      service.reconcile(new Date('2026-08-27T11:00:00Z')),
    ).resolves.toMatchObject({ preserved: 1, scanned: 1 });
    expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
    expect(deletePotentialOrphanSecretArtifact).not.toHaveBeenCalled();
  });

  it('deletes and confirms an expired custom no-pointer orphan before terminalization', async () => {
    const candidate = recoveryCandidate({
      credentialMode: StudentCredentialMode.SHARED_ADMIN_PROVIDED,
      createdAt: new Date('2026-08-25T00:00:00Z'),
    });
    const repository = {
      listRecoveryCandidates: jest.fn().mockResolvedValue([candidate]),
      terminalizeRemainingPendingRows: jest.fn().mockResolvedValue(2),
      finalizeBatch: jest
        .fn()
        .mockResolvedValue(StudentCredentialBatchStatus.FAILED),
    };
    const deletePotentialOrphanSecretArtifact = jest
      .fn()
      .mockResolvedValue(undefined);
    const artifact = {
      readAndVerify: jest.fn().mockResolvedValue({}),
      deletePotentialOrphanSecretArtifact,
    } as unknown as StudentCredentialSecretArtifactService;
    const service = new StudentCredentialBatchReconciliationService(
      repository as unknown as StudentCredentialBatchRepository,
      { ensureJobFromPersistedTruth: jest.fn() } as unknown as BullmqService,
      artifact,
    );

    await expect(
      service.reconcile(new Date('2026-08-27T11:00:00Z')),
    ).resolves.toMatchObject({ terminalized: 1 });
    expect(deletePotentialOrphanSecretArtifact).toHaveBeenCalledWith({
      schoolId: candidate.schoolId,
      batchId: candidate.id,
    });
    expect(repository.terminalizeRemainingPendingRows).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: 'students.credentials.secret_artifact_unavailable',
      }),
    );
  });

  it('keeps expired custom no-pointer state recoverable when orphan absence cannot be confirmed', async () => {
    const candidate = recoveryCandidate({
      credentialMode: StudentCredentialMode.SHARED_ADMIN_PROVIDED,
      createdAt: new Date('2026-08-25T00:00:00Z'),
    });
    const repository = {
      listRecoveryCandidates: jest.fn().mockResolvedValue([candidate]),
      terminalizeRemainingPendingRows: jest.fn(),
      finalizeBatch: jest.fn(),
    };
    const artifact = {
      deletePotentialOrphanSecretArtifact: jest
        .fn()
        .mockRejectedValue(new Error('storage_temporarily_unavailable')),
    };
    const service = new StudentCredentialBatchReconciliationService(
      repository as unknown as StudentCredentialBatchRepository,
      { ensureJobFromPersistedTruth: jest.fn() } as unknown as BullmqService,
      artifact as unknown as StudentCredentialSecretArtifactService,
    );

    await expect(
      service.reconcile(new Date('2026-08-27T11:00:00Z')),
    ).resolves.toMatchObject({ preserved: 1 });
    expect(repository.terminalizeRemainingPendingRows).not.toHaveBeenCalled();
    expect(repository.finalizeBatch).not.toHaveBeenCalled();
  });

  it('blocks partial artifact metadata on a custom PENDING batch', async () => {
    const candidate = recoveryCandidate({
      credentialMode: StudentCredentialMode.SHARED_ADMIN_PROVIDED,
      secretArtifactVersion: 1,
    });
    const repository = {
      listRecoveryCandidates: jest.fn().mockResolvedValue([candidate]),
      terminalizeRemainingPendingRows: jest.fn(),
      finalizeBatch: jest.fn(),
    };
    const bullmq = { ensureJobFromPersistedTruth: jest.fn() };
    const service = new StudentCredentialBatchReconciliationService(
      repository as unknown as StudentCredentialBatchRepository,
      bullmq as unknown as BullmqService,
      artifactCleanupFixture(),
    );

    await expect(
      service.reconcile(new Date('2026-08-27T11:00:00Z')),
    ).resolves.toMatchObject({ blockedInvariant: 1 });
    expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('expires from createdAt for PENDING and terminalizes all remaining work', async () => {
    const candidate = recoveryCandidate({
      createdAt: new Date('2026-08-25T00:00:00Z'),
    });
    const repository = {
      listRecoveryCandidates: jest.fn().mockResolvedValue([candidate]),
      findExecutionBatchById: jest.fn().mockResolvedValue(candidate),
      terminalizeRemainingPendingRows: jest.fn().mockResolvedValue(2),
      finalizeBatch: jest
        .fn()
        .mockResolvedValue(StudentCredentialBatchStatus.FAILED),
    };
    const deletePotentialOrphanSecretArtifact = jest
      .fn()
      .mockResolvedValue(undefined);
    const artifact = {
      deletePotentialOrphanSecretArtifact,
    } as unknown as StudentCredentialSecretArtifactService;
    const service = new StudentCredentialBatchReconciliationService(
      repository as unknown as StudentCredentialBatchRepository,
      { ensureJobFromPersistedTruth: jest.fn() } as unknown as BullmqService,
      artifact,
    );

    await expect(
      service.reconcile(new Date('2026-08-27T11:00:00Z')),
    ).resolves.toMatchObject({
      terminalized: 1,
    });
    expect(repository.terminalizeRemainingPendingRows).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: 'students.credentials.execution_recovery_window_expired',
      }),
    );
    expect(deletePotentialOrphanSecretArtifact).toHaveBeenCalledWith({
      schoolId: 'school-1',
      batchId: 'batch-1',
    });
  });

  it('blocks PENDING recovery when artifact metadata was already staged', async () => {
    const candidate = recoveryCandidate({
      secretArtifactVersion: 1,
      secretArtifactStagedAt: new Date('2026-08-27T10:00:00Z'),
    });
    const repository = {
      listRecoveryCandidates: jest.fn().mockResolvedValue([candidate]),
      terminalizeRemainingPendingRows: jest.fn(),
      finalizeBatch: jest.fn(),
    };
    const bullmq = { ensureJobFromPersistedTruth: jest.fn() };
    const service = new StudentCredentialBatchReconciliationService(
      repository as unknown as StudentCredentialBatchRepository,
      bullmq as unknown as BullmqService,
      artifactCleanupFixture(),
    );

    await expect(
      service.reconcile(new Date('2026-08-27T11:00:00Z')),
    ).resolves.toMatchObject({ blockedInvariant: 1 });
    expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('does not recovery-terminalize when no-pointer orphan deletion fails', async () => {
    const candidate = recoveryCandidate({
      createdAt: new Date('2026-08-25T00:00:00Z'),
    });
    const repository = {
      listRecoveryCandidates: jest.fn().mockResolvedValue([candidate]),
      findExecutionBatchById: jest.fn().mockResolvedValue(candidate),
      terminalizeRemainingPendingRows: jest.fn(),
      finalizeBatch: jest.fn(),
    };
    const artifact = {
      deletePotentialOrphanSecretArtifact: jest
        .fn()
        .mockRejectedValue(new Error('storage_temporarily_unavailable')),
    };
    const service = new StudentCredentialBatchReconciliationService(
      repository as unknown as StudentCredentialBatchRepository,
      { ensureJobFromPersistedTruth: jest.fn() } as unknown as BullmqService,
      artifact as unknown as StudentCredentialSecretArtifactService,
    );

    await expect(
      service.reconcile(new Date('2026-08-27T11:00:00Z')),
    ).rejects.toThrow('storage_temporarily_unavailable');
    expect(repository.terminalizeRemainingPendingRows).not.toHaveBeenCalled();
    expect(repository.finalizeBatch).not.toHaveBeenCalled();
  });
});

function repositoryFixture(
  batch: StudentCredentialExecutionBatch,
  rows: StudentCredentialExecutionRow[],
) {
  return {
    findExecutionBatchById: jest.fn().mockResolvedValue(batch),
    claimBatch: jest.fn().mockResolvedValue(false),
    listExecutionRows: jest.fn().mockResolvedValue(rows),
    applyCredentialRow: jest.fn().mockResolvedValue({ kind: 'generated' }),
    terminalizeRemainingPendingRows: jest.fn().mockResolvedValue(0),
    finalizeBatch: jest
      .fn()
      .mockResolvedValue(StudentCredentialBatchStatus.COMPLETED),
  };
}

function artifactCleanupFixture(): StudentCredentialSecretArtifactService {
  return {
    readAndVerify: jest.fn().mockResolvedValue({}),
    deletePotentialOrphanSecretArtifact: jest.fn().mockResolvedValue(undefined),
  } as unknown as StudentCredentialSecretArtifactService;
}

function batchFixture(
  overrides: Partial<StudentCredentialExecutionBatch> = {},
): StudentCredentialExecutionBatch {
  const now = new Date('2026-08-27T10:00:00Z');
  return {
    id: 'batch-1',
    schoolId: 'school-1',
    organizationId: 'organization-1',
    audienceMode: StudentCredentialAudienceMode.SELECTED_STUDENTS,
    credentialMode: StudentCredentialMode.UNIQUE_GENERATED,
    sourceRegistrationBatchId: null,
    academicYearId: null,
    stageId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
    secretArtifactFileId: 'artifact-file-1',
    secretArtifactVersion: 1,
    secretArtifactStagedAt: now,
    secretArtifactExpiresAt: new Date('2026-08-28T10:00:00Z'),
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
  return [1, 2].map((value) => ({
    id: `row-${value}`,
    schoolId: 'school-1',
    batchId: 'batch-1',
    studentId: `student-${value}`,
    userId: `user-${value}`,
    status: StudentCredentialRowStatus.PENDING,
    credentialVersionBefore: 0,
    credentialVersionAfter: null,
    generatedAt: null,
  }));
}

function recoveryCandidate(
  overrides: Partial<StudentCredentialRecoveryCandidate> = {},
): StudentCredentialRecoveryCandidate {
  const batch = batchFixture({
    status: StudentCredentialBatchStatus.PENDING,
    secretArtifactFileId: null,
    secretArtifactVersion: null,
    secretArtifactStagedAt: null,
    secretArtifactExpiresAt: null,
    startedAt: null,
  });
  const rowCounts = emptyStudentCredentialRowCounts();
  rowCounts[StudentCredentialRowStatus.PENDING] = 2;
  return { ...batch, rowCounts, rowSchoolMismatch: false, ...overrides };
}

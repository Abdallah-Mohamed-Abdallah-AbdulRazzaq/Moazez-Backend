import { classifyPersistedUrl } from '../../../../infrastructure/storage/provider-url.policy';
import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { File as ManagedFile, FileUploadSession } from '@prisma/client';
import {
  assetDisplayText,
  assessmentAssetExternalUrl,
} from '../../../files/assessment-media/domain/assessment-asset-content';
import {
  CreateGradeAssetDto,
  UpdateGradeAssetDto,
  ReorderGradeAssetDto,
} from '../dto/grade-asset.dto';
import { assertAssessmentReadyEvidence } from '../../../files/assessment-media/domain/assessment-media-ready';
import { ASSESSMENT_MEDIA_VERSION } from '../../../files/assessment-media/domain/assessment-media.contract';

const ids = {
  schoolId: randomUUID(),
  organizationId: randomUUID(),
  contextId: randomUUID(),
  creatorId: randomUUID(),
  fileId: randomUUID(),
};
const checksum = 'a'.repeat(64);
function ready() {
  const created = new Date(Date.now() - 10000),
    verified = new Date(Date.now() - 5000),
    completed = new Date(Date.now() - 1000);
  const file: ManagedFile = {
    id: ids.fileId,
    schoolId: ids.schoolId,
    organizationId: ids.organizationId,
    uploaderId: ids.creatorId,
    bucket: 'owned-unit-private',
    objectKey: 'owned/unit/final',
    originalName: 'reference.txt',
    mimeType: 'text/plain',
    sizeBytes: 12n,
    checksumSha256: checksum,
    visibility: 'PRIVATE',
    createdAt: completed,
    updatedAt: completed,
    deletedAt: null,
  };
  const session: FileUploadSession = {
    id: randomUUID(),
    organizationId: ids.organizationId,
    schoolId: ids.schoolId,
    createdByUserId: ids.creatorId,
    clientRequestId: randomUUID(),
    purpose: 'GRADE_ASSESSMENT_MEDIA',
    purposeContextId: ids.contextId,
    originalName: file.originalName,
    expectedMimeType: file.mimeType,
    expectedSizeBytes: file.sizeBytes,
    stagingBucket: file.bucket,
    stagingObjectKey: 'owned/unit/staging',
    finalBucket: file.bucket,
    finalObjectKey: file.objectKey,
    status: 'READY',
    expiresAt: new Date(Date.now() + 10000),
    latestUploadUrlExpiresAt: new Date(0),
    completedAt: completed,
    failedAt: null,
    cancelledAt: null,
    stagingCleanupEligibleAt: null,
    stagingCleanupClaimedAt: null,
    stagingObjectDeletedAt: null,
    finalCleanupEligibleAt: null,
    finalCleanupClaimedAt: null,
    finalObjectDeletedAt: null,
    failureReason: null,
    verifiedMimeType: file.mimeType,
    actualSizeBytes: file.sizeBytes,
    checksumSha256: checksum,
    durationSeconds: null,
    width: null,
    height: null,
    verifiedAt: verified,
    verificationVersion: ASSESSMENT_MEDIA_VERSION,
    assessmentVerificationClaimId: null,
    assessmentSecurityEvidence: {
      verdict: 'CLEAN',
      provider: 'test-only-contract-attestation',
      version: 'test-fixture-v1',
      checksumSha256: checksum,
      verifiedAt: verified.toISOString(),
    },
    fileId: file.id,
    createdAt: created,
    updatedAt: completed,
  };
  return {
    file,
    session,
    scope: {
      ...ids,
      privateBucket: file.bucket,
      expectedPurpose: 'GRADE_ASSESSMENT_MEDIA' as const,
    },
  };
}

describe('ST-07 source and display policy', () => {
  it('accepts the canonical SQL/application intersection and a bare HTTPS host', () => {
    expect(
      assessmentAssetExternalUrl('https://media.example.org/lesson.txt'),
    ).toBe('https://media.example.org/lesson.txt');
    expect(assessmentAssetExternalUrl('https://media.example.org')).toBe(
      'https://media.example.org/',
    );
  });
  it.each([
    ['HTTP', 'http://media.example.org/file'],
    ['credentials', 'https://user:pass@media.example.org/file'],
    ['GCS', 'https://storage.googleapis.com/bucket/key'],
    ['S3', 'https://bucket.s3.amazonaws.com/key'],
    ['other AWS provider', 'https://service.amazonaws.com/key'],
    ['MinIO', 'https://minio.example.org/key'],
    ['private IP', 'https://127.0.0.1/file'],
    ['public IP outside SQL representation', 'https://8.8.8.8/file'],
    ['local DNS', 'https://school.internal/file'],
    ['nonpublic TLD', 'https://school.test/file'],
    [
      'signed query',
      'https://media.example.org/file?X-Amz-Signature=not-a-real-secret',
    ],
    [
      'nested URL',
      'https://media.example.org/go?next=https://storage.googleapis.com/key',
    ],
    ['fragment', 'https://media.example.org/file#token'],
    ['port', 'https://media.example.org:443/file'],
    ['encoding', 'https://media.example.org/%61pi/v1/files/id/download'],
    [
      'protected endpoint',
      'https://media.example.org/api/v1/files/id/download/content',
    ],
    ['dot normalization', 'https://media.example.org/a/../file'],
    ['executable scheme', 'javascript:alert(1)'],
    ['markup', '<img src=x onerror=alert(1)>'],
    ['overlong', 'https://media.example.org/' + 'x'.repeat(2000)],
  ])('rejects %s without returning the rejected value', (_label, url) => {
    expect(() => assessmentAssetExternalUrl(url)).toThrow(
      'Asset external reference is invalid',
    );
  });
  it('honors an application-configured provider endpoint even if SQL would allow its hostname', () => {
    expect(() =>
      assessmentAssetExternalUrl(
        'https://objects.example.org/private',
        (value) =>
          classifyPersistedUrl(value, {
            s3CompatibleEndpoints: ['https://objects.example.org'],
          }),
      ),
    ).toThrow();
  });
  it('normalizes bounded plain display text and rejects executable markup/control characters', () => {
    expect(assetDisplayText('  reference  ', 255)).toBe('reference');
    expect(assetDisplayText('', 255)).toBeNull();
    expect(assetDisplayText(null, 255)).toBeNull();
    for (const value of [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      'unsafe\u0000name',
      'x'.repeat(256),
    ])
      expect(() => assetDisplayText(value, 255)).toThrow();
  });
});

describe('ST-07 server-owned READY evidence', () => {
  it('accepts consistent terminal evidence while keeping expired upload capabilities separate from READY retention', () => {
    const { session, file, scope } = ready();
    session.expiresAt = new Date(Date.now() - 2000); // verified before lease expiry, retained afterwards
    expect(() =>
      assertAssessmentReadyEvidence(session, file, scope),
    ).not.toThrow();
  });
  it.each([
    [
      'not READY',
      (s: FileUploadSession) => {
        s.status = 'FAILED';
      },
    ],
    [
      'wrong purpose',
      (s: FileUploadSession) => {
        s.purpose = 'HOMEWORK_ASSIGNMENT_MEDIA';
      },
    ],
    [
      'wrong context',
      (s: FileUploadSession) => {
        s.purposeContextId = randomUUID();
      },
    ],
    [
      'wrong creator',
      (s: FileUploadSession) => {
        s.createdByUserId = randomUUID();
      },
    ],
    [
      'wrong version',
      (s: FileUploadSession) => {
        s.verificationVersion = 'legacy';
      },
    ],
    [
      'missing timestamp',
      (s: FileUploadSession) => {
        s.verifiedAt = null;
      },
    ],
    [
      'unfinished claim',
      (s: FileUploadSession) => {
        s.assessmentVerificationClaimId = randomUUID();
      },
    ],
    [
      'missing attestation',
      (s: FileUploadSession) => {
        s.assessmentSecurityEvidence = null;
      },
    ],
    [
      'nonclean attestation',
      (s: FileUploadSession) => {
        s.assessmentSecurityEvidence = { verdict: 'DIRTY' };
      },
    ],
    [
      'fake evidence checksum',
      (s: FileUploadSession) => {
        s.assessmentSecurityEvidence = {
          verdict: 'CLEAN',
          checksumSha256: 'b'.repeat(64),
        };
      },
    ],
    [
      'future completion',
      (s: FileUploadSession) => {
        s.completedAt = new Date(Date.now() + 60000);
      },
    ],
  ])('rejects %s', (_label, change) => {
    const { session, file, scope } = ready();
    change(session);
    expect(() => assertAssessmentReadyEvidence(session, file, scope)).toThrow();
  });
  it.each([
    [
      'public',
      (f: ManagedFile) => {
        f.visibility = 'PUBLIC';
      },
    ],
    [
      'retired',
      (f: ManagedFile) => {
        f.deletedAt = new Date();
      },
    ],
    [
      'null School',
      (f: ManagedFile) => {
        f.schoolId = null;
      },
    ],
    [
      'foreign Organization',
      (f: ManagedFile) => {
        f.organizationId = randomUUID();
      },
    ],
    [
      'wrong uploader',
      (f: ManagedFile) => {
        f.uploaderId = randomUUID();
      },
    ],
    [
      'wrong bucket',
      (f: ManagedFile) => {
        f.bucket = 'unrelated';
      },
    ],
    [
      'wrong object',
      (f: ManagedFile) => {
        f.objectKey = 'unrelated';
      },
    ],
    [
      'wrong MIME',
      (f: ManagedFile) => {
        f.mimeType = 'application/pdf';
      },
    ],
    [
      'wrong size',
      (f: ManagedFile) => {
        f.sizeBytes++;
      },
    ],
    [
      'wrong checksum',
      (f: ManagedFile) => {
        f.checksumSha256 = 'b'.repeat(64);
      },
    ],
  ])('rejects a %s File', (_label, change) => {
    const { session, file, scope } = ready();
    change(file);
    expect(() => assertAssessmentReadyEvidence(session, file, scope)).toThrow();
  });
});

describe('ST-07 HTTP DTO immutability', () => {
  const options = { whitelist: true, forbidNonWhitelisted: true };
  it('accepts managed source identifiers and rejects unknown attestation input', async () => {
    const base = {
      sourceType: 'MANAGED_FILE',
      uploadId: randomUUID(),
      fileId: randomUUID(),
    };
    expect(
      await validate(plainToInstance(CreateGradeAssetDto, base), options),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CreateGradeAssetDto, {
          ...base,
          securityAttestation: { verdict: 'CLEAN' },
        }),
        options,
      ),
    ).not.toHaveLength(0);
  });
  it.each([
    'fileId',
    'externalUrl',
    'sourceType',
    'schoolId',
    'questionId',
    'createdByUserId',
    'assetId',
  ])('rejects PATCH %s', async (field) => {
    expect(
      await validate(
        plainToInstance(UpdateGradeAssetDto, {
          [field]: randomUUID(),
        }),
        options,
      ),
    ).not.toHaveLength(0);
  });
  it.each([-1, 1.5, 2147483648])(
    'rejects invalid order %s',
    async (sortOrder) => {
      expect(
        await validate(
          plainToInstance(ReorderGradeAssetDto, { sortOrder }),
          options,
        ),
      ).not.toHaveLength(0);
    },
  );
});

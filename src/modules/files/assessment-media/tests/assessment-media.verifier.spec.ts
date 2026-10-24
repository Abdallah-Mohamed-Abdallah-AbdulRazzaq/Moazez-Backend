import { randomUUID, createHash } from 'node:crypto';
import { MODULE_METADATA } from '@nestjs/common/constants';
import type { FileUploadSession } from '@prisma/client';
import type { StorageService } from '../../../../infrastructure/storage/storage.service';
import { MediaVerifierService } from '../../uploads/application/media-verifier.service';
import { AssessmentMediaModule } from '../assessment-media.module';
import {
  AssessmentMediaSecurityGate,
  AssessmentMediaVerifier,
  UnapprovedAssessmentMediaSecurityGate,
} from '../application/assessment-media-verifier';
import { effectiveAssessmentMediaPolicy } from '../domain/assessment-media.policy';

describe('Assessment Media verification release boundary (unit)', () => {
  const bytes = Buffer.from('safe fixture text\n');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const facts = {
    verifiedMimeType: 'text/plain' as const,
    actualSizeBytes: BigInt(bytes.length),
    checksumSha256: hash,
    durationSeconds: null,
    width: null,
    height: null,
    verifiedAt: new Date(),
    verificationVersion: 'fixture-technical-facts',
  };
  const session = {
    id: randomUUID(),
    originalName: 'response.txt',
    expectedMimeType: 'text/plain',
    expectedSizeBytes: BigInt(bytes.length),
    stagingBucket: 'fixture-only',
    stagingObjectKey: 'staging',
    finalBucket: 'fixture-only',
    finalObjectKey: 'final',
  } as FileUploadSession;
  const stat = {
    size: bytes.length,
    etag: 'owned-version-1',
    contentType: 'text/plain',
    metadata: {},
    lastModified: new Date(),
    generation: null,
    version: null,
  };
  const policy = effectiveAssessmentMediaPolicy(null);

  function setup(
    security: AssessmentMediaSecurityGate = new UnapprovedAssessmentMediaSecurityGate(),
  ) {
    const storage = {
      statObject: jest.fn().mockResolvedValue(stat),
      readObjectRange: jest.fn().mockResolvedValue(bytes),
    };
    const media = {
      verifyAndStoreFinal: jest.fn().mockResolvedValue(facts),
      verify: jest.fn().mockResolvedValue(facts),
    };
    const verifier = new AssessmentMediaVerifier(
      storage as unknown as StorageService,
      media as unknown as MediaVerifierService,
      security,
    );
    return { verifier, storage, media };
  }

  it('never converts an existing object or valid technical facts into READY without DR-07 security verification', async () => {
    const { verifier, media } = setup();
    await expect(verifier.verify(session, policy)).rejects.toMatchObject({
      code: 'assessment_media.security_verification_unavailable',
    });
    expect(media.verifyAndStoreFinal).toHaveBeenCalledTimes(1);
  });

  it('wires only the unapproved fail-closed gate and no public Assessment Media controllers', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AssessmentMediaModule),
    ).toContainEqual({
      provide: AssessmentMediaSecurityGate,
      useClass: UnapprovedAssessmentMediaSecurityGate,
    });
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AssessmentMediaModule) ??
        [],
    ).toEqual([]);
  });

  it.each([
    { size: 0 },
    { size: bytes.length + 1 },
    { contentType: 'text/html' },
    { size: Number.NaN },
  ])(
    'rejects invalid actual metadata before deep verification (%j)',
    async (change) => {
      const { verifier, storage, media } = setup();
      storage.statObject.mockResolvedValue({ ...stat, ...change });
      await expect(verifier.verify(session, policy)).rejects.toMatchObject({
        code: 'assessment_media.verification_failed',
      });
      expect(media.verifyAndStoreFinal).not.toHaveBeenCalled();
    },
  );

  it('rejects an object with no trustworthy version/ETag identity', async () => {
    const { verifier, storage } = setup();
    storage.statObject.mockResolvedValue({ ...stat, etag: null });
    await expect(verifier.verify(session, policy)).rejects.toMatchObject({
      code: 'assessment_media.object_changed',
    });
  });

  it('detects a changed staging generation after technical inspection', async () => {
    const { verifier, storage } = setup();
    storage.statObject
      .mockResolvedValueOnce(stat)
      .mockResolvedValue({ ...stat, generation: 'changed' });
    await expect(verifier.verify(session, policy)).rejects.toMatchObject({
      code: 'assessment_media.object_changed',
    });
  });

  it('bounds timed-out underlying storage work and never releases a late result', async () => {
    jest.useFakeTimers();
    try {
      const { verifier, storage } = setup();
      let settle: (value: typeof stat) => void = () => {
        throw new Error('Pending read missing');
      };
      const pending = new Promise<typeof stat>((resolve) => {
        settle = resolve;
      });
      storage.statObject.mockReturnValue(pending);
      const first = expect(
        verifier.verify(session, policy),
      ).rejects.toMatchObject({ reason: 'verification_timeout' });
      const second = expect(
        verifier.verify(session, policy),
      ).rejects.toMatchObject({ reason: 'verification_timeout' });
      await jest.advanceTimersByTimeAsync(90_000);
      await Promise.all([first, second]);
      await expect(verifier.verify(session, policy)).rejects.toMatchObject({
        reason: 'verifier_unavailable',
      });
      settle(stat);
      await jest.advanceTimersByTimeAsync(0);
      storage.statObject.mockResolvedValue(stat);
      await expect(verifier.verify(session, policy)).rejects.toMatchObject({
        reason: 'security_verification_unavailable',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('cannot accept a security receipt belonging to different bytes', async () => {
    // Deliberate unit contract double, not a production scanner.
    const security: AssessmentMediaSecurityGate = {
      attest: jest.fn().mockResolvedValue({
        verdict: 'CLEAN',
        provider: 'test-only',
        version: 'test-v1',
        checksumSha256: 'a'.repeat(64),
      }),
    };
    await expect(
      setup(security).verifier.verify(session, policy),
    ).rejects.toMatchObject({
      code: 'assessment_media.security_verification_unavailable',
    });
  });

  it('detects final object mutation during a security attestation', async () => {
    const security: AssessmentMediaSecurityGate = {
      attest: jest.fn().mockResolvedValue({
        verdict: 'CLEAN',
        provider: 'test-only',
        version: 'test-v1',
        checksumSha256: hash,
      }),
    };
    const { verifier, storage } = setup(security);
    storage.statObject
      .mockResolvedValueOnce(stat)
      .mockResolvedValueOnce(stat)
      .mockResolvedValueOnce(stat)
      .mockResolvedValue({ ...stat, etag: 'changed-final' });
    await expect(verifier.verify(session, policy)).rejects.toMatchObject({
      code: 'assessment_media.object_changed',
    });
  });

  it('does not call signature/dimension checks deep image verification', async () => {
    const { verifier, storage, media } = setup();
    const header = Buffer.from(
      '89504e470d0a1a0a0000000d494844520000000100000001',
      'hex',
    );
    storage.statObject.mockResolvedValue({
      ...stat,
      contentType: 'image/png',
      size: header.length,
    });
    storage.readObjectRange.mockResolvedValue(header);
    await expect(
      verifier.verify(
        {
          ...session,
          originalName: 'image.png',
          expectedMimeType: 'image/png',
          expectedSizeBytes: BigInt(header.length),
        },
        policy,
      ),
    ).rejects.toMatchObject({ code: 'assessment_media.verifier_unavailable' });
    expect(media.verifyAndStoreFinal).not.toHaveBeenCalled();
  });
});

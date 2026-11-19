import { randomUUID, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { MODULE_METADATA } from '@nestjs/common/constants';
import type { FileUploadSession } from '@prisma/client';
import type { StorageService } from '../../../../infrastructure/storage/storage.service';
import { MediaVerifierService } from '../../uploads/application/media-verifier.service';
import { AssessmentMediaModule } from '../assessment-media.module';
import { AssessmentMediaVerifier } from '../application/assessment-media-verifier';
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

  function setup() {
    const storage = {
      statObject: jest.fn().mockResolvedValue(stat),
      readObjectRange: jest.fn().mockResolvedValue(bytes),
      getObject: jest
        .fn()
        .mockImplementation(() => Promise.resolve(Readable.from([bytes]))),
    };
    const media = {
      verifyAndStoreFinal: jest
        .fn<
          ReturnType<MediaVerifierService['verifyAndStoreFinal']>,
          Parameters<MediaVerifierService['verifyAndStoreFinal']>
        >()
        .mockResolvedValue(facts),
    };
    const verifier = new AssessmentMediaVerifier(
      storage as unknown as StorageService,
      media as unknown as MediaVerifierService,
    );
    return { verifier, storage, media };
  }

  it('returns byte-bound technical evidence after reading the server-owned final object', async () => {
    const { verifier, media, storage } = setup();
    const result = await verifier.verify(session, policy);
    expect(result.technicalEvidence).toMatchObject({
      kind: 'TECHNICAL',
      checksumSha256: hash,
      verifiedAt: result.facts.verifiedAt.toISOString(),
    });
    expect(result.technicalEvidence.objectIdentity).toMatch(/^[a-f0-9]{64}$/u);
    expect(media.verifyAndStoreFinal).toHaveBeenCalledTimes(1);
    expect(storage.getObject).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: session.finalObjectKey,
        raw: true,
      }),
    );
  });

  it('wires the technical verifier without introducing a public controller', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AssessmentMediaModule),
    ).toContain(AssessmentMediaVerifier);
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
      await expect(verifier.verify(session, policy)).resolves.toMatchObject({
        technicalEvidence: { kind: 'TECHNICAL' },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a same-size final object with different bytes even when the stat stays stable', async () => {
    const { verifier, storage } = setup();
    storage.getObject.mockResolvedValue(
      Readable.from([Buffer.alloc(bytes.length, 65)]),
    );
    await expect(verifier.verify(session, policy)).rejects.toMatchObject({
      code: 'assessment_media.object_changed',
    });
  });

  it('detects final object mutation during the checksum read', async () => {
    const { verifier, storage } = setup();
    storage.statObject
      .mockResolvedValueOnce(stat)
      .mockResolvedValueOnce(stat)
      .mockResolvedValueOnce(stat)
      .mockResolvedValue({ ...stat, etag: 'changed-final' });
    await expect(verifier.verify(session, policy)).rejects.toMatchObject({
      code: 'assessment_media.object_changed',
    });
  });

  it('passes pinned generations to the source and final reads', async () => {
    const { verifier, storage, media } = setup();
    storage.statObject
      .mockResolvedValueOnce({ ...stat, generation: '123' })
      .mockResolvedValueOnce({ ...stat, generation: '123' })
      .mockResolvedValue({ ...stat, generation: '456' });
    await verifier.verify(session, policy);
    expect(media.verifyAndStoreFinal.mock.lastCall?.[0]).toMatchObject({
      snapshot: { read: { generation: '123' } },
    });
    expect(storage.getObject).toHaveBeenCalledWith(
      expect.objectContaining({
        generation: '456',
      }),
    );
  });
});

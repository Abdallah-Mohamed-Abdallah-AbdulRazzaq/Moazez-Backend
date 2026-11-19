import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { addAbortSignal } from 'node:stream';
import type { FileUploadSession } from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import type { ObjectStorageStat } from '../../../../infrastructure/storage/object-storage.port';
import { isObjectStorageNotFoundError } from '../../../../infrastructure/storage/object-storage.errors';
import { storageObjectIdentity } from '../../../../infrastructure/storage/object-storage.identity';
import {
  MediaVerifierService,
  MediaVerificationError,
} from '../../uploads/application/media-verifier.service';
import type { MediaVerificationFacts } from '../../uploads/application/media-verifier.service';
import {
  resolveFileContentType,
  verifyFileContentSignature,
} from '../../shared/domain/file-content.registry';
import {
  AssessmentMediaException,
  ASSESSMENT_VERIFICATION_DEADLINE_MS,
} from '../domain/assessment-media.contract';
import type { EffectiveAssessmentMediaPolicy } from '../domain/assessment-media.policy';
import { inspectAssessmentArtifact } from './assessment-artifact-verification';
import type { AssessmentTechnicalEvidence } from '../domain/assessment-media-ready';

function identity(stat: ObjectStorageStat): string {
  const value = storageObjectIdentity(stat);
  if (!value) throw new AssessmentMediaException('object_changed');
  return value;
}

export interface AssessmentVerifiedObject {
  facts: MediaVerificationFacts;
  technicalEvidence: AssessmentTechnicalEvidence;
}

@Injectable()
export class AssessmentMediaVerifier {
  private inFlight = 0;

  constructor(
    private readonly storage: StorageService,
    private readonly media: MediaVerifierService,
  ) {}

  async verify(
    session: FileUploadSession,
    policy: EffectiveAssessmentMediaPolicy,
  ): Promise<AssessmentVerifiedObject> {
    // A caller deadline does not pretend to cancel an opaque SDK operation.
    // Keep its slot until actual settlement, preventing unbounded late work.
    if (this.inFlight >= 2)
      throw new AssessmentMediaException('verifier_unavailable');
    this.inFlight++;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = this.verifyObject(session, policy, controller.signal);
    void work.then(
      () => {
        this.inFlight--;
      },
      () => {
        this.inFlight--;
      },
    );
    try {
      return await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            const error = new AssessmentMediaException('verification_timeout');
            reject(error);
            controller.abort(error);
          }, ASSESSMENT_VERIFICATION_DEADLINE_MS);
          timer.unref();
        }),
      ]);
    } catch (error) {
      if (error instanceof AssessmentMediaException) throw error;
      if (
        error instanceof MediaVerificationError ||
        isObjectStorageNotFoundError(error)
      )
        throw new AssessmentMediaException('verification_failed');
      throw new AssessmentMediaException('verifier_unavailable');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async verifyObject(
    session: FileUploadSession,
    policy: EffectiveAssessmentMediaPolicy,
    signal: AbortSignal,
  ): Promise<AssessmentVerifiedObject> {
    if (!session.stagingBucket || !session.stagingObjectKey)
      throw new AssessmentMediaException('verification_failed');
    const source = {
      bucket: session.stagingBucket,
      objectKey: session.stagingObjectKey,
    };
    const type = resolveFileContentType(
      session.originalName,
      session.expectedMimeType,
    );
    if (!type) throw new AssessmentMediaException('verification_failed');
    const before = await this.storage.statObject(source);
    if (
      !Number.isSafeInteger(before.size) ||
      before.size <= 0 ||
      BigInt(before.size) !== session.expectedSizeBytes ||
      BigInt(before.size) > policy.maximumFileSizeBytes ||
      before.contentType?.trim().toLowerCase() !== session.expectedMimeType
    )
      throw new AssessmentMediaException('verification_failed');
    const sourceIdentity = identity(before);
    const head = await this.storage.readObjectRange({
      ...source,
      offset: 0,
      length: Math.min(before.size, 4096),
    });
    let signatureMatches = false;
    try {
      signatureMatches = verifyFileContentSignature(type, head);
    } catch {
      throw new AssessmentMediaException('verification_failed');
    }
    if (!signatureMatches)
      throw new AssessmentMediaException('verification_failed');
    signal.throwIfAborted();
    const facts = await this.media.verifyAndStoreFinal({
      stagingBucket: source.bucket,
      stagingObjectKey: source.objectKey,
      finalBucket: session.finalBucket,
      finalObjectKey: session.finalObjectKey,
      expectedMimeType: session.expectedMimeType,
      expectedSizeBytes: session.expectedSizeBytes,
      snapshot: {
        read: {
          raw: true,
          generation: before.generation ?? undefined,
          version: before.version ?? undefined,
        },
        signal,
        inspect: (path) =>
          inspectAssessmentArtifact(
            path,
            session.expectedMimeType,
            policy,
            signal,
          ),
      },
    });
    signal.throwIfAborted();
    if (
      facts.actualSizeBytes !== session.expectedSizeBytes ||
      facts.verifiedMimeType !== session.expectedMimeType ||
      !/^[a-f0-9]{64}$/u.test(facts.checksumSha256) ||
      (facts.durationSeconds !== null &&
        facts.durationSeconds > policy.maximumDurationSeconds) ||
      (facts.width !== null && facts.width > policy.maximumWidth) ||
      (facts.height !== null && facts.height > policy.maximumHeight)
    )
      throw new AssessmentMediaException('verification_failed');
    if (identity(await this.storage.statObject(source)) !== sourceIdentity)
      throw new AssessmentMediaException('object_changed');
    const destination = {
      bucket: session.finalBucket,
      objectKey: session.finalObjectKey,
    };
    const finalBefore = await this.storage.statObject(destination);
    const finalIdentity = identity(finalBefore);
    if (
      finalBefore.size !== Number(facts.actualSizeBytes) ||
      finalBefore.contentType !== facts.verifiedMimeType
    )
      throw new AssessmentMediaException('object_changed');
    const finalStream = addAbortSignal(
      signal,
      await this.storage.getObject({
        ...destination,
        raw: true,
        generation: finalBefore.generation ?? undefined,
        version: finalBefore.version ?? undefined,
      }),
    );
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of finalStream as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > finalBefore.size)
        throw new AssessmentMediaException('object_changed');
      hash.update(chunk);
    }
    if (
      size !== finalBefore.size ||
      hash.digest('hex') !== facts.checksumSha256
    )
      throw new AssessmentMediaException('object_changed');
    if (identity(await this.storage.statObject(destination)) !== finalIdentity)
      throw new AssessmentMediaException('object_changed');
    signal.throwIfAborted();
    const verifiedAt = new Date();
    return {
      facts: { ...facts, verifiedAt },
      technicalEvidence: {
        kind: 'TECHNICAL',
        checksumSha256: facts.checksumSha256,
        verifiedAt: verifiedAt.toISOString(),
        objectIdentity: finalIdentity,
      },
    };
  }
}

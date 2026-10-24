import { Injectable } from '@nestjs/common';
import type { FileUploadSession, Prisma } from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import type { ObjectStorageStat } from '../../../../infrastructure/storage/object-storage.port';
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

export interface AssessmentSecurityAttestation {
  verdict: 'CLEAN';
  provider: string;
  version: string;
  checksumSha256: string;
}
export abstract class AssessmentMediaSecurityGate {
  abstract attest(input: {
    uploadId: string;
    bucket: string;
    objectKey: string;
    facts: MediaVerificationFacts;
    objectIdentity: string;
  }): Promise<AssessmentSecurityAttestation>;
}

/** DR-07 has not approved a scanner. This is deliberately not a scan adapter. */
@Injectable()
export class UnapprovedAssessmentMediaSecurityGate extends AssessmentMediaSecurityGate {
  attest(): Promise<AssessmentSecurityAttestation> {
    return Promise.reject(
      new AssessmentMediaException('security_verification_unavailable'),
    );
  }
}

function identity(stat: ObjectStorageStat): string {
  if (!stat.etag && !stat.generation && !stat.version)
    throw new AssessmentMediaException('object_changed');
  return JSON.stringify([
    stat.etag,
    stat.generation,
    stat.version,
    stat.size,
    stat.contentType,
  ]);
}

export interface AssessmentVerifiedObject {
  facts: MediaVerificationFacts;
  securityEvidence: Prisma.InputJsonObject;
}

@Injectable()
export class AssessmentMediaVerifier {
  private inFlight = 0;

  constructor(
    private readonly storage: StorageService,
    private readonly media: MediaVerifierService,
    private readonly security: AssessmentMediaSecurityGate,
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
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const assertLive = () => {
      if (timedOut) throw new AssessmentMediaException('verification_timeout');
    };
    const work = this.verifyObject(session, policy, assertLive);
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
            timedOut = true;
            reject(new AssessmentMediaException('verification_timeout'));
          }, ASSESSMENT_VERIFICATION_DEADLINE_MS);
          timer.unref();
        }),
      ]);
    } catch (error) {
      if (error instanceof AssessmentMediaException) throw error;
      if (error instanceof MediaVerificationError)
        throw new AssessmentMediaException('verification_failed');
      throw new AssessmentMediaException('verifier_unavailable');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async verifyObject(
    session: FileUploadSession,
    policy: EffectiveAssessmentMediaPolicy,
    assertLive: () => void,
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
    if (!verifyFileContentSignature(type, head))
      throw new AssessmentMediaException('verification_failed');
    assertLive();
    if (
      type.category === 'IMAGE' ||
      session.expectedMimeType === 'application/pdf'
    ) {
      // Reuse bounded dimension/signature checks, but never promote their
      // result into a deep image/PDF integrity or malware attestation.
      const inspected = await this.media.verify({
        ...source,
        expectedMimeType: session.expectedMimeType,
        expectedSizeBytes: session.expectedSizeBytes,
      });
      if (
        (inspected.width !== null && inspected.width > policy.maximumWidth) ||
        (inspected.height !== null && inspected.height > policy.maximumHeight)
      )
        throw new AssessmentMediaException('verification_failed');
      throw new AssessmentMediaException('verifier_unavailable');
    }
    const facts = await this.media.verifyAndStoreFinal({
      stagingBucket: source.bucket,
      stagingObjectKey: source.objectKey,
      finalBucket: session.finalBucket,
      finalObjectKey: session.finalObjectKey,
      expectedMimeType: session.expectedMimeType,
      expectedSizeBytes: session.expectedSizeBytes,
    });
    assertLive();
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
      BigInt(finalBefore.size) !== facts.actualSizeBytes ||
      finalBefore.contentType !== facts.verifiedMimeType
    )
      throw new AssessmentMediaException('object_changed');
    const attestation = await this.security.attest({
      uploadId: session.id,
      ...destination,
      facts,
      objectIdentity: finalIdentity,
    });
    assertLive();
    if (
      attestation.verdict !== 'CLEAN' ||
      attestation.checksumSha256 !== facts.checksumSha256 ||
      !/^[a-z0-9._-]{1,80}$/u.test(attestation.provider) ||
      !/^[a-z0-9._-]{1,80}$/u.test(attestation.version)
    )
      throw new AssessmentMediaException('security_verification_unavailable');
    if (identity(await this.storage.statObject(destination)) !== finalIdentity)
      throw new AssessmentMediaException('object_changed');
    assertLive();
    return {
      facts,
      securityEvidence: {
        ...attestation,
        verifiedAt: facts.verifiedAt.toISOString(),
      },
    };
  }
}

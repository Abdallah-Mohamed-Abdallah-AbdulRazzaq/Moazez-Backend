import { Injectable } from '@nestjs/common';
import { ReinforcementProofType } from '@prisma/client';
import { Readable } from 'node:stream';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { assertDeclaredProofMimeAllowed } from '../domain/reinforcement-review-domain';
import {
  detectReinforcementProofMime,
  ReinforcementProofInvalidContentException,
  ReinforcementProofMimeMismatchException,
  REINFORCEMENT_PROOF_PREFIX_MAX_BYTES,
  REINFORCEMENT_PROOF_VERIFICATION_TIMEOUT_MS,
  ReinforcementProofVerificationUnavailableException,
} from '../domain/reinforcement-proof-content';

export interface VerifyReinforcementProofContentInput {
  proofType: ReinforcementProofType;
  declaredMimeType: string;
  bucket: string;
  objectKey: string;
  expectedSizeBytes: bigint;
}

@Injectable()
export class ReinforcementProofContentVerifierService {
  constructor(private readonly storage: StorageService) {}

  async verify(input: VerifyReinforcementProofContentInput): Promise<void> {
    assertDeclaredProofMimeAllowed({
      proofType: input.proofType,
      mimeType: input.declaredMimeType,
    });

    if (input.expectedSizeBytes <= 0n) {
      throw new ReinforcementProofInvalidContentException({
        reason: 'empty_object',
      });
    }

    const stat = await this.runStorageOperation(() =>
      this.storage.statObject({
        bucket: input.bucket,
        objectKey: input.objectKey,
      }),
    );
    const actualSizeBytes = normalizeStorageSize(stat.size);
    if (actualSizeBytes === null || actualSizeBytes <= 0n) {
      throw new ReinforcementProofInvalidContentException({
        reason: 'empty_object',
      });
    }
    if (actualSizeBytes !== input.expectedSizeBytes) {
      throw new ReinforcementProofInvalidContentException({
        reason: 'size_mismatch',
        expectedSizeBytes: input.expectedSizeBytes.toString(),
        actualSizeBytes: actualSizeBytes.toString(),
      });
    }

    const targetBytes = Math.min(
      Number(actualSizeBytes),
      REINFORCEMENT_PROOF_PREFIX_MAX_BYTES,
    );
    const prefix = await this.readObjectPrefix({
      bucket: input.bucket,
      objectKey: input.objectKey,
      targetBytes,
    });
    const detectedMimeType = detectReinforcementProofMime(prefix);
    if (!detectedMimeType) {
      throw new ReinforcementProofInvalidContentException({
        reason: 'unrecognized_or_malformed_content',
      });
    }

    assertDeclaredProofMimeAllowed({
      proofType: input.proofType,
      mimeType: detectedMimeType,
    });
    const declaredMimeType = input.declaredMimeType.trim().toLowerCase();
    if (detectedMimeType !== declaredMimeType) {
      throw new ReinforcementProofMimeMismatchException({
        proofType: input.proofType,
        declaredMimeType,
        detectedMimeType,
      });
    }
  }

  private async readObjectPrefix(input: {
    bucket: string;
    objectKey: string;
    targetBytes: number;
  }): Promise<Buffer> {
    const stream = await this.runStorageOperation(() =>
      this.storage.getObject({
        bucket: input.bucket,
        objectKey: input.objectKey,
      }),
    );

    try {
      return await withTimeout(collectPrefix(stream, input.targetBytes), () =>
        stream.destroy(),
      );
    } catch (error) {
      if (error instanceof TruncatedObjectError) {
        throw new ReinforcementProofInvalidContentException({
          reason: 'truncated_object',
        });
      }
      if (error instanceof ReinforcementProofInvalidContentException) {
        throw error;
      }
      throw new ReinforcementProofVerificationUnavailableException(error);
    } finally {
      if (!stream.destroyed) stream.destroy();
    }
  }

  private async runStorageOperation<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await withTimeout(Promise.resolve().then(operation));
    } catch (error) {
      throw new ReinforcementProofVerificationUnavailableException(error);
    }
  }
}

class VerificationTimeoutError extends Error {}
class TruncatedObjectError extends Error {}

async function collectPrefix(
  stream: Readable,
  targetBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk as Uint8Array);
    const remainingBytes = targetBytes - receivedBytes;
    if (remainingBytes <= 0) break;

    const accepted = buffer.subarray(0, remainingBytes);
    chunks.push(accepted);
    receivedBytes += accepted.length;
    if (receivedBytes >= targetBytes) break;
  }

  if (receivedBytes < targetBytes) throw new TruncatedObjectError();
  return Buffer.concat(chunks, receivedBytes);
}

function normalizeStorageSize(value: unknown): bigint | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return null;
  }
  return BigInt(value);
}

function withTimeout<T>(
  operation: Promise<T>,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout?.();
      reject(new VerificationTimeoutError());
    }, REINFORCEMENT_PROOF_VERIFICATION_TIMEOUT_MS);

    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          error instanceof Error
            ? error
            : new Error('Proof verification operation failed'),
        );
      },
    );
  });
}

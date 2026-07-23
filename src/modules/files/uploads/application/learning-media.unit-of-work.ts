import type {
  FileUploadSession,
  FileUploadSessionStatus,
  FileVisibility,
  UserType,
} from '@prisma/client';

export type LearningMediaAuditContext = {
  actorId: string;
  userType: UserType;
  organizationId: string;
  schoolId: string;
};

export type LearningMediaIntentInput = LearningMediaAuditContext & {
  id: string;
  clientRequestId: string;
  originalName: string;
  expectedMimeType: string;
  expectedSizeBytes: bigint;
  stagingBucket: string;
  stagingObjectKey: string;
  finalBucket: string;
  finalObjectKey: string;
  expiresAt: Date;
  createdAt: Date;
};

export type LearningMediaVerificationFacts = {
  verifiedMimeType: string;
  actualSizeBytes: bigint;
  checksumSha256: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  verifiedAt: Date;
  verificationVersion: string;
};

export type LearningMediaFinalizeInput = LearningMediaAuditContext &
  LearningMediaVerificationFacts & {
    uploadId: string;
    fileId: string;
    visibility: FileVisibility;
    completedAt: Date;
    stagingCleanupEligibleAt: Date | null;
    finalCleanupEligibleAt: Date;
  };

export type LearningMediaIntentResult = {
  session: FileUploadSession;
  created: boolean;
};

export type LearningMediaClaimResult =
  | { status: 'claimed'; session: FileUploadSession }
  | { status: 'ready'; session: FileUploadSession }
  | { status: 'expired'; session: FileUploadSession }
  | { status: 'conflict'; session: FileUploadSession }
  | { status: 'not_found' };

export interface LearningMediaTransactionContext {
  createOrFindIntent(
    input: LearningMediaIntentInput,
  ): Promise<LearningMediaIntentResult>;
  persistUploadUrlCapability(input: {
    schoolId: string;
    actorId: string;
    uploadId: string;
    capabilityExpiresAt: Date;
    now: Date;
  }): Promise<FileUploadSession | null>;
  markSigningFailed(
    input: LearningMediaAuditContext & {
      uploadId: string;
      now: Date;
    },
  ): Promise<FileUploadSession | null>;
  claimVerification(input: {
    schoolId: string;
    actorId: string;
    uploadId: string;
    now: Date;
  }): Promise<LearningMediaClaimResult>;
  claimLegacyVerification(input: {
    organizationId: string;
    schoolId: string;
    actorId: string;
    uploadId: string;
  }): Promise<LearningMediaClaimResult>;
  finalize(input: LearningMediaFinalizeInput): Promise<FileUploadSession>;
  markFailed(
    input: LearningMediaAuditContext & {
      uploadId: string;
      reasonCode: string;
      now: Date;
    },
  ): Promise<void>;
  releaseVerification(input: {
    schoolId: string;
    uploadId: string;
  }): Promise<void>;
  markFinalCleanupPending(input: {
    schoolId: string;
    uploadId: string;
    now: Date;
  }): Promise<void>;
  cancel(
    input: LearningMediaAuditContext & {
      uploadId: string;
      now: Date;
    },
  ): Promise<FileUploadSession | null>;
  updateStatus(input: {
    schoolId: string;
    uploadId: string;
    from: FileUploadSessionStatus;
    to: FileUploadSessionStatus;
  }): Promise<boolean>;
}

export abstract class LearningMediaUnitOfWork {
  abstract execute<T>(
    callback: (context: LearningMediaTransactionContext) => Promise<T>,
  ): Promise<T>;
}

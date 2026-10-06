import type {
  AcademicContentAsset,
  File,
  FileUploadSession,
} from '@prisma/client';
import type { AcademicContentTeacherWriteScope } from '../../infrastructure/academic-content-teacher-write.authorization';

export type AcademicContentFileWriteAuthorization = {
  teacherScope: AcademicContentTeacherWriteScope;
  ownershipOnly?: boolean;
};

export type AcademicUploadIdentity = {
  uploadId: string;
  schoolId: string;
  actorId: string;
  contentId: string;
};

export type AcademicUploadResourceIdentity = Pick<
  AcademicUploadIdentity,
  'uploadId' | 'schoolId' | 'contentId'
>;

export type AcademicAssetIdentity = {
  assetId: string;
  schoolId: string;
  contentId: string;
};

export type AcademicUploadIntent = {
  id: string;
  organizationId: string;
  schoolId: string;
  createdByUserId: string;
  clientRequestId: string;
  purposeContextId: string;
  originalName: string;
  expectedMimeType: string;
  expectedSizeBytes: bigint;
  finalBucket: string;
  finalObjectKey: string;
  expiresAt: Date;
};

export type AcademicUploadUpdate = Partial<
  Pick<
    FileUploadSession,
    | 'status'
    | 'fileId'
    | 'cancelledAt'
    | 'completedAt'
    | 'verifiedMimeType'
    | 'actualSizeBytes'
    | 'checksumSha256'
    | 'durationSeconds'
    | 'width'
    | 'height'
    | 'verifiedAt'
    | 'verificationVersion'
    | 'finalCleanupEligibleAt'
    | 'finalCleanupClaimedAt'
    | 'finalObjectDeletedAt'
  >
>;

export type AcademicFileCreate = Pick<
  File,
  | 'id'
  | 'organizationId'
  | 'schoolId'
  | 'uploaderId'
  | 'bucket'
  | 'objectKey'
  | 'originalName'
  | 'mimeType'
  | 'sizeBytes'
  | 'checksumSha256'
  | 'visibility'
>;

export type AcademicAssetCreate = Pick<
  AcademicContentAsset,
  'schoolId' | 'academicContentId' | 'fileId' | 'createdByUserId'
>;

export interface AcademicContentFileTransaction {
  lockUpload(
    identity: AcademicUploadIdentity,
  ): Promise<FileUploadSession | null>;
  lockUploadById(uploadId: string): Promise<FileUploadSession | null>;
  readyLink(
    session: FileUploadSession,
  ): Promise<{ file: File; asset: AcademicContentAsset } | null>;
  updateUpload(
    identity: AcademicUploadResourceIdentity,
    data: AcademicUploadUpdate,
  ): Promise<FileUploadSession>;
  lockMutableContent(
    contentId: string,
    schoolId: string,
    now: Date,
    authorization?: AcademicContentFileWriteAuthorization,
  ): Promise<void>;
  createFile(data: AcademicFileCreate): Promise<File>;
  createAsset(data: AcademicAssetCreate): Promise<AcademicContentAsset>;
  recordCompletedAudit(input: {
    actorId: string;
    organizationId: string;
    schoolId: string;
    assetId: string;
    uploadId: string;
    contentId: string;
    fileId: string;
  }): Promise<void>;
  findActiveAsset(input: {
    assetId: string;
    contentId: string;
    schoolId: string;
  }): Promise<AcademicContentAsset | null>;
  findUploadIdForFile(fileId: string, schoolId: string): Promise<string | null>;
  lockActiveFile(fileId: string, schoolId: string): Promise<boolean>;
  lockActiveAsset(input: {
    assetId: string;
    contentId: string;
    schoolId: string;
  }): Promise<boolean>;
  softDeleteAsset(
    identity: AcademicAssetIdentity,
    deletedAt: Date,
  ): Promise<AcademicContentAsset>;
  hasRetainedFileReferences(fileId: string): Promise<boolean>;
  extendReadyCleanup(
    fileId: string,
    schoolId: string,
    eligibleAt: Date,
  ): Promise<void>;
  softDeleteFile(
    fileId: string,
    schoolId: string,
    deletedAt: Date,
  ): Promise<void>;
}

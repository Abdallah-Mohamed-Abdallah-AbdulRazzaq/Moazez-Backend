import { FileVisibility } from '@prisma/client';

export type StoredFileMetadata = {
  id: string;
  organizationId: string | null;
  schoolId: string | null;
  uploaderId: string | null;
  bucket: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint;
  checksumSha256: string | null;
  visibility: FileVisibility;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

import { FileVisibility } from '@prisma/client';

export class RegisterFileMetadataDto {
  organizationId?: string | null;
  schoolId?: string | null;
  uploaderId?: string | null;
  bucket!: string;
  objectKey!: string;
  originalName!: string;
  mimeType!: string;
  sizeBytes!: bigint;
  checksumSha256?: string | null;
  visibility!: FileVisibility;
}

export class FileRecordResponseDto {
  id!: string;
  originalName!: string;
  mimeType!: string;
  sizeBytes!: string;
  visibility!: FileVisibility;
  createdAt!: string;
}

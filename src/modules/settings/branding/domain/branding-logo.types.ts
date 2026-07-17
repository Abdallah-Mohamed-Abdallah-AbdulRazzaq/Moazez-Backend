import { Readable } from 'node:stream';
import { FileVisibility, UserType } from '@prisma/client';
import { BrandingLogoMimeType } from './branding-logo.constants';

export interface BrandingLogoMultipartFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface BrandingLogoActorScope {
  actorId: string;
  userType: UserType;
  organizationId: string;
  schoolId: string;
}

export interface ManagedBrandingLogoFile {
  id: string;
  organizationId: string | null;
  schoolId: string | null;
  bucket: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: bigint;
  visibility: FileVisibility;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface EligibleBrandingLogoFile extends ManagedBrandingLogoFile {
  organizationId: string;
  schoolId: string;
  mimeType: BrandingLogoMimeType;
}

export interface CleanupBrandingLogoFile extends ManagedBrandingLogoFile {
  schoolOrganizationId: string | null;
}

export interface PublicBrandingLogoStream {
  stream: Readable;
  mimeType: BrandingLogoMimeType;
  sizeBytes: number;
}

export interface BrandingLogoCleanupJobData {
  fileId: string;
}

export interface BrandingLogoReconcileJobData {
  requestedAt: string;
}

export interface BrandingLogoCleanupCursor {
  deletedAt: Date;
  id: string;
}

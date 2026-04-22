import { FileVisibility } from '@prisma/client';

export type AttachmentRecord = {
  id: string;
  fileId: string;
  schoolId: string;
  resourceType: string;
  resourceId: string;
  createdById: string | null;
  createdAt: Date;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint;
    visibility: FileVisibility;
  };
};

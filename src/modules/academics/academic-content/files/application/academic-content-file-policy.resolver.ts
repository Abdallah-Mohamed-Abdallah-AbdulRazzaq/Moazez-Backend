import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import {
  ACADEMIC_CONTENT_PLATFORM_DEFAULT_MAX_FILE_SIZE_BYTES,
  ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES,
} from '../domain/academic-content-file.constants';
import type { AcademicContentFileCategory } from '../domain/academic-content-file.registry';

@Injectable()
export class AcademicContentFilePolicyResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(schoolId: string) {
    const row = await this.prisma.academicContentFilePolicy.findUnique({
      where: { schoolId },
    });
    const maximumFileSizeBytes =
      row?.maximumFileSizeBytes ??
      ACADEMIC_CONTENT_PLATFORM_DEFAULT_MAX_FILE_SIZE_BYTES;
    return {
      attachmentsEnabled: row?.attachmentsEnabled ?? true,
      maximumFileSizeBytes:
        maximumFileSizeBytes <
        ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES
          ? maximumFileSizeBytes
          : ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES,
      documentsEnabled: row?.documentsEnabled ?? true,
      imagesEnabled: row?.imagesEnabled ?? true,
      videosEnabled: row?.videosEnabled ?? true,
      audioEnabled: row?.audioEnabled ?? true,
      archivesEnabled: row?.archivesEnabled ?? false,
      otherFilesEnabled: row?.otherFilesEnabled ?? false,
      allowStudentDownload: row?.allowStudentDownload ?? true,
      allowGuardianDownload: row?.allowGuardianDownload ?? true,
      allowInlinePreview: row?.allowInlinePreview ?? true,
    };
  }

  categoryEnabled(
    policy: Awaited<ReturnType<AcademicContentFilePolicyResolver['resolve']>>,
    category: AcademicContentFileCategory,
  ): boolean {
    switch (category) {
      case 'DOCUMENT':
        return policy.documentsEnabled;
      case 'IMAGE':
        return policy.imagesEnabled;
      case 'VIDEO':
        return policy.videosEnabled;
      case 'AUDIO':
        return policy.audioEnabled;
      case 'ARCHIVE':
        return policy.archivesEnabled;
      case 'OTHER':
        return policy.otherFilesEnabled;
    }
  }
}

import { Injectable } from '@nestjs/common';
import { effectiveAcademicContentFilePolicy } from '../domain/academic-content-file-policy';
import type { AcademicContentFileCategory } from '../domain/academic-content-file.registry';
import { AcademicContentFileRepository } from '../infrastructure/academic-content-file.repository';

@Injectable()
export class AcademicContentFilePolicyResolver {
  constructor(private readonly repository: AcademicContentFileRepository) {}

  async resolve(schoolId: string) {
    const row = await this.repository.findPolicy(schoolId);
    return effectiveAcademicContentFilePolicy(row);
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

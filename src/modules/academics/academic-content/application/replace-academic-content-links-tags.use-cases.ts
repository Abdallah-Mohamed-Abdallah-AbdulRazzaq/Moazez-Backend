import { Injectable } from '@nestjs/common';
import { academicContentManagementScope } from './academic-content-management.scope';
import {
  AcademicContentLinkInput,
  AcademicContentTagInput,
  normalizeAcademicContentLinks,
  normalizeAcademicContentTags,
} from '../domain/academic-content-links-tags.policy';
import { AcademicContentLinksTagsRepository } from '../infrastructure/academic-content-links-tags.repository';

@Injectable()
export class ReplaceAcademicContentLinksUseCase {
  constructor(private readonly links: AcademicContentLinksTagsRepository) {}

  execute(
    contentId: string,
    input: readonly AcademicContentLinkInput[],
    now = new Date(),
  ) {
    const scope = academicContentManagementScope(
      'academics.academic_content.manage',
    );
    const links = normalizeAcademicContentLinks(input);
    return this.links.replaceLinks({ ...scope, contentId, links, now });
  }
}

@Injectable()
export class ReplaceAcademicContentTagsUseCase {
  constructor(private readonly tags: AcademicContentLinksTagsRepository) {}

  execute(
    contentId: string,
    input: readonly AcademicContentTagInput[],
    now = new Date(),
  ) {
    const scope = academicContentManagementScope(
      'academics.academic_content.manage',
    );
    const tags = normalizeAcademicContentTags(input);
    return this.tags.replaceTags({ ...scope, contentId, tags, now });
  }
}

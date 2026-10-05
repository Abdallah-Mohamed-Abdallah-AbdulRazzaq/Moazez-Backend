import { Inject, Injectable } from '@nestjs/common';
import {
  AcademicContentAudienceType,
  AcademicContentType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { assertAcademicContentAudience } from '../domain/academic-content-audience.policy';
import {
  normalizeAcademicContentDescription,
  normalizeAcademicContentTitle,
} from '../domain/academic-content-lifecycle.policy';
import {
  AcademicContentLinkInput,
  AcademicContentTagInput,
  normalizeAcademicContentLinks,
  normalizeAcademicContentTags,
} from '../domain/academic-content-links-tags.policy';
import {
  GuardianNoteCommand,
  OnlineSessionCommand,
  PreparationCommand,
  SubjectResourceCommand,
  WeeklyPlanCommand,
  normalizeGuardianNote,
  normalizeOnlineSession,
  normalizePreparation,
  normalizeSubjectResource,
  normalizeWeeklyPlan,
} from '../domain/academic-content-type-detail.policy';
import { AcademicContentRepository } from '../infrastructure/academic-content.repository';
import { AcademicContentTargetRepository } from '../infrastructure/academic-content-target.repository';
import { AcademicContentLinksTagsRepository } from '../infrastructure/academic-content-links-tags.repository';
import type { AcademicContentTeacherWriteScope } from '../infrastructure/academic-content-teacher-write.authorization';
import { ACADEMIC_CONTENT_TYPE_DETAIL_UNIT_OF_WORK } from './academic-content-type-detail.unit-of-work';
import type { AcademicContentTypeDetailUnitOfWork } from './academic-content-type-detail.unit-of-work';
import type { UpdateAcademicContentCommand } from './academic-content-lifecycle.use-cases';

export type CreateAcademicContentForClassCommand = {
  type: AcademicContentType;
  audience: AcademicContentAudienceType;
  title: string;
  description?: string | null;
};

/** Trusted Core operations: callers prove the actor and manage permission first. */
@Injectable()
export class AcademicContentAuthoringOperations {
  constructor(
    private readonly contents: AcademicContentRepository,
    private readonly targets: AcademicContentTargetRepository,
    private readonly linksTags: AcademicContentLinksTagsRepository,
    @Inject(ACADEMIC_CONTENT_TYPE_DETAIL_UNIT_OF_WORK)
    private readonly details: AcademicContentTypeDetailUnitOfWork,
  ) {}

  create(
    scope: AcademicContentTeacherWriteScope,
    classId: string,
    command: CreateAcademicContentForClassCommand,
    now = new Date(),
  ) {
    if (
      !command ||
      Object.keys(command).some(
        (key) => !['type', 'audience', 'title', 'description'].includes(key),
      )
    )
      throw new ValidationDomainException(
        'Teacher academic context is server-derived',
      );
    assertAcademicContentAudience(command.type, command.audience);
    return this.contents.createForTeacherAllocation({
      ...scope,
      classId,
      type: command.type,
      audience: command.audience,
      title: normalizeAcademicContentTitle(command.title),
      description: normalizeAcademicContentDescription(command.description),
      now,
    });
  }

  update(
    scope: AcademicContentTeacherWriteScope,
    id: string,
    command: UpdateAcademicContentCommand,
    now = new Date(),
  ) {
    if (
      !command ||
      Object.keys(command).some(
        (key) => !['title', 'description', 'audience'].includes(key),
      )
    )
      throw new ValidationDomainException('Only draft metadata may be updated');
    return this.contents.mutate({
      ...scope,
      id,
      action: 'update',
      now,
      changes: {
        ...(command.title === undefined
          ? {}
          : { title: normalizeAcademicContentTitle(command.title) }),
        ...(command.description === undefined
          ? {}
          : {
              description: normalizeAcademicContentDescription(
                command.description,
              ),
            }),
        ...(command.audience === undefined
          ? {}
          : { audience: command.audience }),
      },
    });
  }

  lifecycle(
    scope: AcademicContentTeacherWriteScope,
    id: string,
    action: 'archive' | 'restore' | 'delete',
    now = new Date(),
  ) {
    return this.contents.mutate({ ...scope, id, action, now });
  }

  replaceTargets(
    scope: AcademicContentTeacherWriteScope,
    contentId: string,
    classIds: readonly string[],
  ) {
    return this.targets.replace({ ...scope, contentId, classIds });
  }

  preparation(
    scope: AcademicContentTeacherWriteScope,
    contentId: string,
    command: PreparationCommand,
    now = new Date(),
  ) {
    return this.details.mutate({
      ...scope,
      contentId,
      detail: normalizePreparation(command),
      now,
    });
  }
  weeklyPlan(
    scope: AcademicContentTeacherWriteScope,
    contentId: string,
    command: WeeklyPlanCommand,
    now = new Date(),
  ) {
    return this.details.mutate({
      ...scope,
      contentId,
      detail: normalizeWeeklyPlan(command),
      now,
    });
  }
  guardianNote(
    scope: AcademicContentTeacherWriteScope,
    contentId: string,
    command: GuardianNoteCommand,
    now = new Date(),
  ) {
    return this.details.mutate({
      ...scope,
      contentId,
      detail: normalizeGuardianNote(command),
      now,
    });
  }
  subjectResource(
    scope: AcademicContentTeacherWriteScope,
    contentId: string,
    command: SubjectResourceCommand,
    now = new Date(),
  ) {
    return this.details.mutate({
      ...scope,
      contentId,
      detail: normalizeSubjectResource(command),
      now,
    });
  }
  onlineSession(
    scope: AcademicContentTeacherWriteScope,
    contentId: string,
    command: OnlineSessionCommand,
    now = new Date(),
  ) {
    return this.details.mutate({
      ...scope,
      contentId,
      detail: normalizeOnlineSession(command),
      now,
    });
  }
  links(
    scope: AcademicContentTeacherWriteScope,
    contentId: string,
    input: readonly AcademicContentLinkInput[],
    now = new Date(),
  ) {
    return this.linksTags.replaceLinks({
      ...scope,
      contentId,
      links: normalizeAcademicContentLinks(input),
      now,
    });
  }
  tags(
    scope: AcademicContentTeacherWriteScope,
    contentId: string,
    input: readonly AcademicContentTagInput[],
    now = new Date(),
  ) {
    return this.linksTags.replaceTags({
      ...scope,
      contentId,
      tags: normalizeAcademicContentTags(input),
      now,
    });
  }
}

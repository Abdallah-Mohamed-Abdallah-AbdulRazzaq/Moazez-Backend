import { Injectable } from '@nestjs/common';
import {
  AcademicContentPublicationStatus as PublicationStatus,
  AcademicContentStatus as ContentStatus,
} from '@prisma/client';
import { GetAcademicContentReadinessUseCase } from './academic-content-readiness.use-case';
import { AcademicContentPublicationRepository } from '../infrastructure/academic-content-publication.repository';
import type { AcademicContentManagementDetail } from '../infrastructure/academic-content.repository';
import type { AcademicContentEffectiveWorkflowPolicy } from '../domain/academic-content-workflow.policy';
import {
  isAcademicContentApprovalRequired,
  isAcademicContentSubmissionSource,
} from '../domain/academic-content-workflow.policy';

@Injectable()
export class AcademicContentWorkflowPublicationCapabilities {
  constructor(
    private readonly readiness: GetAcademicContentReadinessUseCase,
    private readonly publications: AcademicContentPublicationRepository,
  ) {}

  /** Convenience evidence for an already authorized current parent; never a write lease. */
  async evaluateAuthorizedContent(
    content: AcademicContentManagementDetail,
    workflow: AcademicContentEffectiveWorkflowPolicy,
    now: Date,
  ) {
    const identity = { schoolId: content.schoolId, contentId: content.id };
    const [authoring, publication, history] = await Promise.all([
      this.readiness.evaluateAuthorizedContent(content, now),
      this.publications.readiness({ ...identity, now }),
      this.publications.history({ ...identity, page: 1, limit: 1 }),
    ]);
    const latest = history.items[0];
    const published =
      content.status === ContentStatus.PUBLISHED &&
      latest?.status === PublicationStatus.PUBLISHED &&
      latest.publishedAt !== null;
    return {
      canSubmit:
        isAcademicContentSubmissionSource(content.status) &&
        isAcademicContentApprovalRequired(content.type, workflow) &&
        authoring.canAdvance,
      canPublish: publication.canPublish || publication.canSchedule,
      canUnschedule:
        content.status === ContentStatus.SCHEDULED &&
        latest?.status === PublicationStatus.SCHEDULED &&
        (latest.sourceContentStatus === ContentStatus.DRAFT ||
          latest.sourceContentStatus === ContentStatus.APPROVED),
      canCancelPublication: published,
      canStartRevision: published,
    };
  }
}

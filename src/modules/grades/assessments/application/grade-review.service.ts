import { Injectable } from '@nestjs/common';
import type { PrivateMediaContentRequest } from '../../../../infrastructure/storage/private-media-content.service';
import type { GradeAssetActor } from '../domain/grade-asset';
import type { GradeReviewAudience } from '../domain/grade-review-policy';
import type {
  GradeReviewerActor,
  GradeReviewAnswerResource,
} from '../domain/grade-reviewer-actor';
import type {
  ApplyGradeScoringSuggestionDto,
  SetGradeReviewReleaseDto,
} from '../dto/grade-review.dto';
import { GradeKeyApprovalsRepository } from '../infrastructure/grade-key-approvals.repository';
import type { GradeReviewAudienceResource } from '../infrastructure/grade-review-audience.authorization';
import { GradeReviewReleaseRepository } from '../infrastructure/grade-review-release.repository';
import { GradeScoringRepository } from '../infrastructure/grade-scoring.repository';
import type { GradeAnswerMediaResource } from '../infrastructure/grade-answer-media.repository';
import { GradeAnswerMediaService } from './grade-answer-media.service';
import { GradeAssetsService } from './grade-assets.service';
import { GradeQuestionGroupsService } from './grade-question-groups.service';

@Injectable()
export class GradeReviewService {
  constructor(
    private readonly releases: GradeReviewReleaseRepository,
    private readonly keys: GradeKeyApprovalsRepository,
    private readonly scoring: GradeScoringRepository,
    private readonly answers: GradeAnswerMediaService,
    private readonly assets: GradeAssetsService,
    private readonly groups: GradeQuestionGroupsService,
  ) {}
  policy(assessmentId: string) {
    return this.releases.policy(assessmentId);
  }
  setPolicy(assessmentId: string, command: SetGradeReviewReleaseDto) {
    return this.releases.setPolicy(assessmentId, command);
  }
  approveKey(assessmentId: string, questionId: string, revision: string) {
    return this.keys.approve(assessmentId, questionId, revision);
  }
  revokeKey(assessmentId: string, questionId: string, approvalId: string) {
    return this.keys.revoke(assessmentId, questionId, approvalId);
  }
  evaluate(actor: GradeReviewerActor, resource: GradeReviewAnswerResource) {
    return this.scoring.evaluate(actor, resource);
  }
  suggestion(
    actor: GradeReviewerActor,
    resource: GradeReviewAnswerResource,
    id: string,
  ) {
    return this.scoring.get(actor, resource, id);
  }
  apply(
    actor: GradeReviewerActor,
    resource: GradeReviewAnswerResource,
    id: string,
    command: ApplyGradeScoringSuggestionDto,
  ) {
    return this.scoring.apply(actor, resource, id, command);
  }
  read(audience: GradeReviewAudience, resource: GradeReviewAudienceResource) {
    return this.releases.read(audience, resource);
  }
  private mediaActor(
    audience: GradeReviewAudience,
    resource: GradeReviewAudienceResource,
  ): GradeAssetActor {
    return {
      surface: 'released-review',
      audience,
      studentId: resource.studentId,
      authorize: async (tx, assessmentId) => {
        await this.releases.authorizeMedia(tx, audience, {
          ...resource,
          assessmentId,
        });
      },
    };
  }
  answerAssets(
    audience: GradeReviewAudience,
    resource: GradeReviewAudienceResource & GradeAnswerMediaResource,
  ) {
    return this.answers.list(resource, {
      audience,
      authorize: async (tx) => {
        await this.releases.authorizeMedia(tx, audience, resource);
      },
    });
  }
  openAnswer(
    audience: GradeReviewAudience,
    resource: GradeReviewAudienceResource &
      GradeAnswerMediaResource & { assetId: string },
    request: PrivateMediaContentRequest,
  ) {
    return this.answers.open(resource, request, {
      audience,
      authorize: async (tx) => {
        await this.releases.authorizeMedia(tx, audience, resource);
      },
    });
  }
  paperAssets(
    audience: GradeReviewAudience,
    resource: GradeReviewAudienceResource & { questionId?: string },
  ) {
    return this.assets.list(this.mediaActor(audience, resource), resource);
  }
  openPaper(
    audience: GradeReviewAudience,
    resource: GradeReviewAudienceResource & {
      questionId?: string;
      assetId: string;
    },
    request: PrivateMediaContentRequest,
  ) {
    return this.assets.openContent(
      this.mediaActor(audience, resource),
      resource,
      request,
    );
  }
  openGroup(
    audience: GradeReviewAudience,
    resource: GradeReviewAudienceResource & {
      groupId: string;
      assetId: string;
    },
    request: PrivateMediaContentRequest,
  ) {
    return this.groups.open(
      this.mediaActor(audience, resource),
      resource,
      request,
    );
  }
}

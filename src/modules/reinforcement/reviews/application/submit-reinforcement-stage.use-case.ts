import { Injectable } from '@nestjs/common';
import { ReinforcementProofType } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { ReinforcementProofContentVerifierService } from './reinforcement-proof-content-verifier.service';
import { requireReinforcementScope } from '../../reinforcement-context';
import {
  assertAssignmentCanSubmit,
  assertDeclaredProofMimeAllowed,
  assertProofPayloadMatchesProofType,
  assertStageBelongsToTask,
  assertSubmissionCanBeSubmitted,
  deriveAssignmentStatusAfterSubmit,
  normalizeNullableText,
} from '../domain/reinforcement-review-domain';
import { SubmitReinforcementStageDto } from '../dto/reinforcement-review.dto';
import { ReinforcementReviewsRepository } from '../infrastructure/reinforcement-reviews.repository';
import { presentReinforcementReviewItem } from '../presenters/reinforcement-review.presenter';
import { buildSubmissionAuditEntry } from './reinforcement-review-use-case.helpers';

@Injectable()
export class SubmitReinforcementStageUseCase {
  constructor(
    private readonly reviewsRepository: ReinforcementReviewsRepository,
    private readonly authRepository: AuthRepository,
    private readonly proofContentVerifier: ReinforcementProofContentVerifierService,
  ) {}

  async execute(
    assignmentId: string,
    stageId: string,
    command: SubmitReinforcementStageDto,
  ) {
    const scope = requireReinforcementScope();
    const assignment =
      await this.reviewsRepository.findAssignmentForSubmit(assignmentId);
    if (!assignment) {
      throw new NotFoundDomainException('Reinforcement assignment not found', {
        assignmentId,
      });
    }
    assertAssignmentCanSubmit(assignment);

    const stage = await this.reviewsRepository.findStageForAssignment({
      assignment,
      stageId,
    });
    if (!stage) {
      throw new NotFoundDomainException('Reinforcement task stage not found', {
        assignmentId,
        stageId,
      });
    }
    assertStageBelongsToTask({ stage, taskId: assignment.taskId });
    assertProofPayloadMatchesProofType({
      proofType: stage.proofType,
      proofFileId: command.proofFileId,
    });

    if (command.proofFileId) {
      const proofFile = await this.reviewsRepository.findProofFile({
        fileId: command.proofFileId,
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        uploaderId: scope.actorId,
      });
      if (!proofFile) {
        throw new NotFoundDomainException('Proof file not found', {
          proofFileId: command.proofFileId,
        });
      }

      assertDeclaredProofMimeAllowed({
        proofType: stage.proofType,
        mimeType: proofFile.mimeType,
      });

      if (stage.proofType !== ReinforcementProofType.NONE) {
        await this.proofContentVerifier.verify({
          proofType: stage.proofType,
          declaredMimeType: proofFile.mimeType,
          bucket: proofFile.bucket,
          objectKey: proofFile.objectKey,
          expectedSizeBytes: proofFile.sizeBytes,
        });
      }
    }

    const existing =
      await this.reviewsRepository.findSubmissionByAssignmentStage({
        assignmentId,
        stageId,
      });
    assertSubmissionCanBeSubmitted(existing);

    const submitted = await this.reviewsRepository.createOrResubmitSubmission({
      schoolId: scope.schoolId,
      assignment,
      stage,
      existingSubmissionId: existing?.id ?? null,
      assignmentStatus: deriveAssignmentStatusAfterSubmit(assignment),
      proofText: normalizeNullableText(command.proofText),
      proofFileId: normalizeNullableText(command.proofFileId),
      submittedById: scope.actorId,
      submittedAt: new Date(),
      metadata: command.metadata,
    });

    await this.authRepository.createAuditLog(
      buildSubmissionAuditEntry({
        scope,
        action: 'reinforcement.submission.submit',
        submission: submitted,
        beforeStatus: existing?.status ?? null,
      }),
    );

    return presentReinforcementReviewItem(submitted);
  }
}

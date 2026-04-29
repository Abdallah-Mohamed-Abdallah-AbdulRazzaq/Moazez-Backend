import { Injectable } from '@nestjs/common';
import { XpSourceType } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope } from '../../reinforcement-context';
import {
  assertSubmissionEligibleForXpGrant,
  buildXpLedgerPayload,
  isUniqueConstraintError,
  resolveXpAmountFromReinforcementSubmission,
} from '../domain/reinforcement-xp-domain';
import { GrantXpForReinforcementReviewDto } from '../dto/reinforcement-xp.dto';
import { ReinforcementXpRepository } from '../infrastructure/reinforcement-xp.repository';
import { presentXpLedgerEntry } from '../presenters/reinforcement-xp.presenter';
import {
  buildLedgerAuditEntry,
  enforceXpPolicyForGrant,
  findEffectivePolicyForScope,
  scopeFromEnrollment,
  toJsonInput,
} from './reinforcement-xp-use-case.helpers';

@Injectable()
export class GrantXpForReinforcementReviewUseCase {
  constructor(
    private readonly xpRepository: ReinforcementXpRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    submissionId: string,
    command: GrantXpForReinforcementReviewDto,
  ) {
    const scope = requireReinforcementScope();
    const submission =
      await this.xpRepository.findSubmissionForXpGrant(submissionId);
    if (!submission) {
      throw new NotFoundDomainException('Reinforcement submission not found', {
        submissionId,
      });
    }
    assertSubmissionEligibleForXpGrant(submission);

    const sourceType = XpSourceType.REINFORCEMENT_TASK;
    const sourceId = submission.id;
    const existing = await this.xpRepository.findExistingLedgerBySource({
      sourceType,
      sourceId,
      studentId: submission.studentId,
    });
    if (existing) {
      return presentXpLedgerEntry(existing);
    }

    const amount = resolveXpAmountFromReinforcementSubmission({
      overrideAmount: command.amount,
      task: submission.task,
    });
    const now = new Date();
    const resolvedScope = scopeFromEnrollment({
      studentId: submission.studentId,
      enrollment: submission.enrollment,
    });
    const policy = await findEffectivePolicyForScope({
      repository: this.xpRepository,
      schoolId: scope.schoolId,
      academicYearId: submission.task.academicYearId,
      termId: submission.task.termId,
      scope: resolvedScope,
      now,
    });
    const capUsage = await enforceXpPolicyForGrant({
      repository: this.xpRepository,
      policy,
      academicYearId: submission.task.academicYearId,
      termId: submission.task.termId,
      studentId: submission.studentId,
      amount,
      reason: command.reason,
      sourceType,
      now,
    });

    const payload = buildXpLedgerPayload({
      schoolId: scope.schoolId,
      academicYearId: submission.task.academicYearId,
      termId: submission.task.termId,
      studentId: submission.studentId,
      enrollmentId: submission.enrollmentId,
      assignmentId: submission.assignmentId,
      policyId: policy?.id ?? null,
      sourceType,
      sourceId,
      amount,
      reason: command.reason ?? 'reinforcement_task',
      reasonAr: command.reasonAr,
      actorUserId: scope.actorId,
      occurredAt: now,
      metadata: {
        submissionId: submission.id,
        currentReviewId: submission.currentReviewId,
      },
    });

    try {
      const ledger = await this.xpRepository.createXpLedger({
        ...payload,
        metadata: toJsonInput(payload.metadata),
      });
      await this.authRepository.createAuditLog(
        buildLedgerAuditEntry({
          scope,
          action: 'reinforcement.xp.grant',
          ledger,
          capUsage,
        }),
      );

      return presentXpLedgerEntry(ledger);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const duplicate = await this.xpRepository.findExistingLedgerBySource({
          sourceType,
          sourceId,
          studentId: submission.studentId,
        });
        if (duplicate) return presentXpLedgerEntry(duplicate);
      }

      throw error;
    }
  }
}

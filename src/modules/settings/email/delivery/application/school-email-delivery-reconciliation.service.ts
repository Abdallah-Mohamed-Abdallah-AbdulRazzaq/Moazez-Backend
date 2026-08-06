import { Injectable } from '@nestjs/common';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../../common/context/request-context';
import { BullmqService } from '../../../../../infrastructure/queue/bullmq.service';
import {
  buildSchoolEmailDeliveryRecipientJobId,
  SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
  SCHOOL_EMAIL_DELIVERY_RECOVERY_WINDOW_MS,
  SCHOOL_EMAIL_DELIVERY_SENDING_LEASE_MS,
  SCHOOL_EMAIL_DELIVERY_SEND_RECIPIENT_JOB_NAME,
  SCHOOL_EMAIL_OUTCOME_UNKNOWN_REASON,
  SCHOOL_EMAIL_RECOVERY_WINDOW_EXPIRED_REASON,
} from '../domain/email-delivery.constants';
import {
  EmailDeliveryRepository,
  SchoolEmailRecoveryCandidate,
} from '../infrastructure/email-delivery.repository';

const EMAIL_RECOVERY_PAGE_SIZE = 100;

@Injectable()
export class SchoolEmailDeliveryReconciliationService {
  constructor(
    private readonly repository: EmailDeliveryRepository,
    private readonly queue: BullmqService,
  ) {}

  async reconcile(now = new Date()): Promise<{
    restored: number;
    outcomeUnknown: number;
    terminalized: number;
  }> {
    const outcomeUnknown = await this.classifyStaleSending(now);
    const windowStartedAt = new Date(
      now.getTime() - SCHOOL_EMAIL_DELIVERY_RECOVERY_WINDOW_MS,
    );
    let terminalized = await this.terminalizeExpired(windowStartedAt);
    let restored = 0;
    let afterId: string | undefined;

    do {
      const candidates = await this.repository.listRecoveryCandidates({
        windowStartedAt,
        expired: false,
        afterId,
        take: EMAIL_RECOVERY_PAGE_SIZE,
      });
      for (const candidate of candidates) {
        if (candidate.ineligibilityReason) {
          await this.terminalizeCandidate(
            candidate,
            candidate.ineligibilityReason,
          );
          terminalized += 1;
          continue;
        }
        const result = await this.queue.ensureJobFromPersistedTruth(
          SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
          SCHOOL_EMAIL_DELIVERY_SEND_RECIPIENT_JOB_NAME,
          toJobData(candidate),
          {
            jobId: buildSchoolEmailDeliveryRecipientJobId({
              batchId: candidate.batchId,
              recipientId: candidate.id,
            }),
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          },
        );
        if (result === 'created' || result === 'replaced') restored += 1;
      }
      afterId =
        candidates.length === EMAIL_RECOVERY_PAGE_SIZE
          ? candidates[candidates.length - 1]?.id
          : undefined;
    } while (afterId);

    return { restored, outcomeUnknown, terminalized };
  }

  private async classifyStaleSending(now: Date): Promise<number> {
    const staleBefore = new Date(
      now.getTime() - SCHOOL_EMAIL_DELIVERY_SENDING_LEASE_MS,
    );
    let changed = 0;
    while (true) {
      const candidates =
        await this.repository.listStaleSendingRecoveryCandidates({
          staleBefore,
          take: EMAIL_RECOVERY_PAGE_SIZE,
        });
      if (candidates.length === 0) return changed;
      for (const candidate of candidates) {
        await this.terminalizeCandidate(
          candidate,
          candidate.ineligibilityReason ?? SCHOOL_EMAIL_OUTCOME_UNKNOWN_REASON,
        );
        changed += 1;
      }
    }
  }

  private async terminalizeExpired(windowStartedAt: Date): Promise<number> {
    let changed = 0;
    while (true) {
      const candidates = await this.repository.listRecoveryCandidates({
        windowStartedAt,
        expired: true,
        take: EMAIL_RECOVERY_PAGE_SIZE,
      });
      if (candidates.length === 0) return changed;
      for (const candidate of candidates) {
        await this.terminalizeCandidate(
          candidate,
          candidate.ineligibilityReason ??
            SCHOOL_EMAIL_RECOVERY_WINDOW_EXPIRED_REASON,
        );
        changed += 1;
      }
    }
  }

  private runInCandidateContext<T>(
    candidate: SchoolEmailRecoveryCandidate,
    operation: () => Promise<T>,
  ): Promise<T> {
    const context = createRequestContext(
      `school-email-delivery-recovery:${candidate.id}`,
    );
    if (candidate.actorUserId && candidate.actorUserType) {
      context.actor = {
        id: candidate.actorUserId,
        userType: candidate.actorUserType,
      };
    }
    context.activeMembership = {
      membershipId: 'queue:school-email-delivery-recovery',
      organizationId: candidate.organizationId,
      schoolId: candidate.schoolId,
      roleId: 'queue:school-email-delivery-recovery',
      permissions: [],
    };
    return runWithRequestContext(context, operation);
  }

  private terminalizeCandidate(
    candidate: SchoolEmailRecoveryCandidate,
    failureReason: string,
  ): Promise<void> {
    return this.runInCandidateContext(candidate, async () => {
      await this.repository.markRecipientFailed({
        recipientId: candidate.id,
        failureReason,
      });
      await this.repository.refreshBatchStatus(candidate.batchId);
    });
  }
}

function toJobData(candidate: SchoolEmailRecoveryCandidate) {
  return {
    schoolId: candidate.schoolId,
    organizationId: candidate.organizationId,
    batchId: candidate.batchId,
    recipientId: candidate.id,
    actorUserId: candidate.actorUserId,
    actorUserType: candidate.actorUserType,
  };
}

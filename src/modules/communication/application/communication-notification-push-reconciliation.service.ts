import { Injectable } from '@nestjs/common';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import {
  buildCommunicationNotificationPushJobId,
  COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
  COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS,
} from '../domain/communication-notification-generation-domain';
import {
  CommunicationNotificationPushRepository,
  CommunicationPushRecoveryCandidate,
} from '../infrastructure/communication-notification-push.repository';
import { CommunicationNotificationPushDeliveryService } from './communication-notification-push-delivery.service';

const PUSH_RECOVERY_PAGE_SIZE = 100;

@Injectable()
export class CommunicationNotificationPushReconciliationService {
  constructor(
    private readonly repository: CommunicationNotificationPushRepository,
    private readonly deliveryService: CommunicationNotificationPushDeliveryService,
    private readonly queue: BullmqService,
  ) {}

  async reconcile(now = new Date()): Promise<{
    restored: number;
    terminalized: number;
  }> {
    const windowStartedAt = new Date(
      now.getTime() - COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS,
    );
    let terminalized = await this.terminalizeExpired(windowStartedAt, now);
    let afterId: string | undefined;
    let restored = 0;

    do {
      const candidates = await this.repository.listPushRecoveryCandidates({
        windowStartedAt,
        expired: false,
        afterId,
        take: PUSH_RECOVERY_PAGE_SIZE,
      });
      for (const candidate of candidates) {
        if (candidate.ineligibilityCode) {
          await this.terminalizeCandidate(
            candidate,
            candidate.ineligibilityCode,
            now,
          );
          terminalized += 1;
          continue;
        }
        const result = await this.queue.ensureJobFromPersistedTruth(
          COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
          COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
          toJobData(candidate),
          {
            jobId: buildCommunicationNotificationPushJobId({
              deliveryId: candidate.id,
            }),
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          },
        );
        if (result === 'created' || result === 'replaced') restored += 1;
      }
      afterId =
        candidates.length === PUSH_RECOVERY_PAGE_SIZE
          ? candidates[candidates.length - 1]?.id
          : undefined;
    } while (afterId);

    return { restored, terminalized };
  }

  private async terminalizeExpired(
    windowStartedAt: Date,
    now: Date,
  ): Promise<number> {
    let terminalized = 0;
    while (true) {
      const candidates = await this.repository.listPushRecoveryCandidates({
        windowStartedAt,
        expired: true,
        take: PUSH_RECOVERY_PAGE_SIZE,
      });
      if (candidates.length === 0) return terminalized;

      for (const candidate of candidates) {
        await this.terminalizeCandidate(
          candidate,
          candidate.ineligibilityCode ?? 'push/recovery-window-expired',
          now,
        );
        terminalized += 1;
      }
    }
  }

  private async terminalizeCandidate(
    candidate: CommunicationPushRecoveryCandidate,
    errorCode: string,
    now: Date,
  ): Promise<void> {
    const context = createRequestContext(
      `communication-push-recovery-terminal:${candidate.id}`,
    );
    if (candidate.actorUserId && candidate.actorUserType) {
      context.actor = {
        id: candidate.actorUserId,
        userType: candidate.actorUserType,
      };
    }
    context.activeMembership = {
      membershipId: 'queue:communication-push-recovery',
      organizationId: candidate.organizationId,
      schoolId: candidate.schoolId,
      roleId: 'queue:communication-push-recovery',
      permissions: [],
    };
    await runWithRequestContext(context, () =>
      this.deliveryService.terminalizeRecovery({
        schoolId: candidate.schoolId,
        deliveryId: candidate.id,
        errorCode,
        errorMessage: 'Push source is ineligible for recovery',
        now,
      }),
    );
  }
}

function toJobData(candidate: CommunicationPushRecoveryCandidate) {
  return {
    schoolId: candidate.schoolId,
    organizationId: candidate.organizationId,
    notificationId: candidate.notificationId,
    deliveryId: candidate.id,
    actorUserId: candidate.actorUserId,
    actorUserType: candidate.actorUserType,
  };
}

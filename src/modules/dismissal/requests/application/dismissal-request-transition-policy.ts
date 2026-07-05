import { DismissalRequestStatus } from '@prisma/client';
import { DismissalRequestInvalidTransitionException } from '../../shared/dismissal.errors';

const ALLOWED_TRANSITIONS: Partial<
  Record<DismissalRequestStatus, DismissalRequestStatus[]>
> = {
  [DismissalRequestStatus.REQUESTED]: [
    DismissalRequestStatus.QUEUED,
    DismissalRequestStatus.CALLED,
  ],
  [DismissalRequestStatus.QUEUED]: [DismissalRequestStatus.CALLED],
  [DismissalRequestStatus.CALLED]: [
    DismissalRequestStatus.MOVING,
    DismissalRequestStatus.AT_GATE,
  ],
  [DismissalRequestStatus.MOVING]: [DismissalRequestStatus.AT_GATE],
  [DismissalRequestStatus.AT_GATE]: [DismissalRequestStatus.READY],
};

export function assertDismissalRequestTransitionAllowed(
  currentStatus: DismissalRequestStatus,
  nextStatus: DismissalRequestStatus,
): void {
  const allowedTargets = ALLOWED_TRANSITIONS[currentStatus] ?? [];

  if (!allowedTargets.includes(nextStatus)) {
    throw new DismissalRequestInvalidTransitionException();
  }
}

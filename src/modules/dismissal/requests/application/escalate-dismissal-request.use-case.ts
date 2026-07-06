import { Injectable } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { ACTIVE_DISMISSAL_REQUEST_STATUSES } from '../../shared/dismissal.types';
import {
  DismissalEscalationInvalidReasonException,
  DismissalEscalationNotFoundException,
  DismissalEscalationTerminalRequestException,
} from '../../shared/dismissal.errors';
import {
  DismissalEscalationReason,
  EscalateDismissalRequestDto,
  EscalateDismissalRequestResponseDto,
} from '../dto/escalate-dismissal-request.dto';
import { DismissalRequestsHistoryRepository } from '../infrastructure/dismissal-requests-history.repository';
import { DismissalRequestsReadRepository } from '../infrastructure/dismissal-requests-read.repository';
import {
  presentDismissalRequestEscalation,
  requestHasEscalation,
} from '../presenter/dismissal-request-history.presenter';
import { requireDismissalRequestQueueScope } from './dismissal-request-queue-scope';
import {
  isRequestVisibleToStaff,
  resolveThresholds,
} from './list-active-dismissal-requests.use-case';

const ESCALATION_REASONS: DismissalEscalationReason[] = [
  'student_not_arrived',
  'gate_congestion',
  'parent_waiting',
  'safety_concern',
  'manual_follow_up',
  'other',
];

@Injectable()
export class EscalateDismissalRequestUseCase {
  constructor(
    private readonly historyRepository: DismissalRequestsHistoryRepository,
    private readonly readRepository: DismissalRequestsReadRepository,
  ) {}

  async execute(
    requestId: string,
    command: EscalateDismissalRequestDto,
  ): Promise<EscalateDismissalRequestResponseDto> {
    const scope = requireDismissalRequestQueueScope();
    const now = new Date();
    const reason = parseEscalationReason(command.reason);
    const note = normalizeEscalationNote(command.note);

    const [request, thresholdSettings, assignments] = await Promise.all([
      this.historyRepository.findHistoryRequestById(requestId),
      this.historyRepository.findSettingsThresholds(),
      scope.userType === UserType.DISMISSAL_STAFF
        ? this.readRepository.listActiveStaffAssignments({
            staffUserId: scope.actorId,
            now,
          })
        : Promise.resolve([]),
    ]);

    if (!request) {
      throw new DismissalEscalationNotFoundException();
    }

    if (
      scope.userType === UserType.DISMISSAL_STAFF &&
      !isRequestVisibleToStaff(request, assignments)
    ) {
      throw new DismissalEscalationNotFoundException();
    }

    if (!ACTIVE_DISMISSAL_REQUEST_STATUSES.includes(request.status)) {
      throw new DismissalEscalationTerminalRequestException();
    }

    const thresholds = resolveThresholds(thresholdSettings);

    if (requestHasEscalation(request)) {
      return presentDismissalRequestEscalation({
        request,
        changed: false,
        thresholds,
        now,
      });
    }

    const escalated = await this.historyRepository.escalateWithEventAndAudit({
      schoolId: scope.schoolId,
      organizationId: scope.organizationId,
      requestId: request.id,
      actorUserId: scope.actorId,
      userType: scope.userType,
      status: request.status,
      reason,
      note,
    });

    return presentDismissalRequestEscalation({
      request: escalated,
      changed: true,
      thresholds,
      now,
    });
  }
}

function parseEscalationReason(
  value: string | undefined,
): DismissalEscalationReason {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    throw new DismissalEscalationInvalidReasonException();
  }

  if (
    !ESCALATION_REASONS.includes(
      normalized as DismissalEscalationReason,
    )
  ) {
    throw new DismissalEscalationInvalidReasonException();
  }

  return normalized as DismissalEscalationReason;
}

function normalizeEscalationNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  const trimmed = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return trimmed.length > 0 ? trimmed : null;
}

import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserType } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import {
  DismissalRequestNotFoundException,
} from '../../shared/dismissal.errors';
import { parseDismissalRequestTransitionTarget } from '../../shared/dismissal.types';
import {
  DismissalRequestStatusUpdateResponseDto,
  UpdateDismissalRequestStatusDto,
} from '../dto/update-dismissal-request-status.dto';
import { DismissalRequestsReadRepository } from '../infrastructure/dismissal-requests-read.repository';
import { DismissalRequestsWriteRepository } from '../infrastructure/dismissal-requests-write.repository';
import { presentDismissalRequestStatusUpdate } from '../presenter/dismissal-request-queue.presenter';
import { requireDismissalRequestQueueScope } from './dismissal-request-queue-scope';
import { assertDismissalRequestTransitionAllowed } from './dismissal-request-transition-policy';
import {
  isRequestVisibleToStaff,
  resolveThresholds,
} from './list-active-dismissal-requests.use-case';

@Injectable()
export class UpdateDismissalRequestStatusUseCase {
  constructor(
    private readonly dismissalRequestsReadRepository: DismissalRequestsReadRepository,
    private readonly dismissalRequestsWriteRepository: DismissalRequestsWriteRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    requestId: string,
    command: UpdateDismissalRequestStatusDto,
  ): Promise<DismissalRequestStatusUpdateResponseDto> {
    const scope = requireDismissalRequestQueueScope();
    const now = new Date();
    const nextStatus = parseDismissalRequestTransitionTarget(command.status);
    const note = normalizeStatusNote(command.note);

    const [request, thresholdSettings, assignments] = await Promise.all([
      this.dismissalRequestsReadRepository.findActiveRequestById(requestId),
      this.dismissalRequestsReadRepository.findSettingsThresholds(),
      scope.userType === UserType.DISMISSAL_STAFF
        ? this.dismissalRequestsReadRepository.listActiveStaffAssignments({
            staffUserId: scope.actorId,
            now,
          })
        : Promise.resolve([]),
    ]);

    if (!request) {
      throw new DismissalRequestNotFoundException();
    }

    if (
      scope.userType === UserType.DISMISSAL_STAFF &&
      !isRequestVisibleToStaff(request, assignments)
    ) {
      throw new DismissalRequestNotFoundException();
    }

    const thresholds = resolveThresholds(thresholdSettings);

    if (request.status === nextStatus) {
      return presentDismissalRequestStatusUpdate({
        request,
        previousStatus: null,
        changed: false,
        thresholds,
        now,
      });
    }

    assertDismissalRequestTransitionAllowed(request.status, nextStatus);

    const updated =
      await this.dismissalRequestsWriteRepository.updateStatusWithEvent({
        schoolId: scope.schoolId,
        requestId: request.id,
        statusFrom: request.status,
        statusTo: nextStatus,
        actorUserId: scope.actorId,
        note,
      });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'dismissal',
      action: 'dismissal.request.status_changed',
      resourceType: 'dismissal_request',
      resourceId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      before: {
        status: request.status,
      },
      after: {
        status: updated.status,
        note: Boolean(note),
      },
    });

    return presentDismissalRequestStatusUpdate({
      request: updated,
      previousStatus: request.status,
      changed: true,
      thresholds,
      now,
    });
  }
}

function normalizeStatusNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

import { Injectable } from '@nestjs/common';
import { DismissalRequestStatus } from '@prisma/client';
import { DismissalRealtimeEventsService } from '../../../dismissal/realtime/dismissal-realtime-events.service';
import {
  CancelParentSmartPickupRequestDto,
  CancelParentSmartPickupRequestResponseDto,
} from '../dto/cancel-parent-smart-pickup-request.dto';
import {
  isRecentCallEnrollmentActive,
  ParentSmartPickupRecentCallsRepository,
} from '../infrastructure/parent-smart-pickup-recent-calls.repository';
import { ParentSmartPickupRecentCallsPresenter } from '../presenter/parent-smart-pickup-recent-calls.presenter';
import {
  DismissalRequestAlreadyTerminalException,
  DismissalRequestCancelDisabledException,
  DismissalRequestCancelNotAllowedException,
  DismissalRequestNotFoundForParentException,
} from './parent-smart-pickup.errors';
import { resolveParentSmartPickupScope } from './list-parent-smart-pickup-recent-calls.use-case';

@Injectable()
export class CancelParentSmartPickupRequestUseCase {
  constructor(
    private readonly recentCallsRepository: ParentSmartPickupRecentCallsRepository,
    private readonly dismissalRealtimeEvents: DismissalRealtimeEventsService,
  ) {}

  async execute(
    requestId: string,
    command: CancelParentSmartPickupRequestDto,
  ): Promise<CancelParentSmartPickupRequestResponseDto> {
    const scope = resolveParentSmartPickupScope();
    const note = normalizeCancelNote(command.note);

    const [settings, request] = await Promise.all([
      this.recentCallsRepository.findSettings(),
      this.recentCallsRepository.findOwnedRequestById({
        parentUserId: scope.actorId,
        requestId,
      }),
    ]);

    if (!request) {
      throw new DismissalRequestNotFoundForParentException();
    }

    if (request.status === DismissalRequestStatus.CANCELLED) {
      return ParentSmartPickupRecentCallsPresenter.presentCancel({
        request,
        settings,
        previousStatus: request.status,
        changed: false,
      });
    }

    if (!isRecentCallEnrollmentActive(request)) {
      throw new DismissalRequestNotFoundForParentException();
    }

    if (settings?.allowParentCancelBeforeCalled !== true) {
      throw new DismissalRequestCancelDisabledException();
    }

    if (
      request.status === DismissalRequestStatus.HANDED_OVER ||
      request.status === DismissalRequestStatus.EXPIRED
    ) {
      throw new DismissalRequestAlreadyTerminalException();
    }

    if (
      request.status !== DismissalRequestStatus.REQUESTED &&
      request.status !== DismissalRequestStatus.QUEUED
    ) {
      throw new DismissalRequestCancelNotAllowedException();
    }

    const cancelled =
      await this.recentCallsRepository.cancelWithEventAndAudit({
        schoolId: scope.schoolId,
        organizationId: scope.organizationId,
        requestId: request.id,
        actorUserId: scope.actorId,
        userType: scope.userType,
        statusFrom: request.status,
        note,
      });

    await this.dismissalRealtimeEvents.publishRequestCancelled({
      schoolId: scope.schoolId,
      requestId: cancelled.id,
      previousStatus: request.status,
    });

    return ParentSmartPickupRecentCallsPresenter.presentCancel({
      request: cancelled,
      settings,
      previousStatus: request.status,
      changed: true,
    });
  }
}

function normalizeCancelNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

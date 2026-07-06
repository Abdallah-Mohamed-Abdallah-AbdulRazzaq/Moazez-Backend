import { Injectable } from '@nestjs/common';
import { DismissalRequestStatus, UserType } from '@prisma/client';
import {
  DismissalDeliveryAlreadyDeliveredException,
  DismissalDeliveryInvalidPickupCodeException,
  DismissalDeliveryInvalidPickupRecipientException,
  DismissalDeliveryNotFoundException,
  DismissalDeliveryNotReadyException,
  DismissalDeliveryPickupCodeNotIssuedException,
  DismissalDeliveryPickupCodeRequiredException,
  DismissalDeliveryPickupRecipientNotAllowedException,
  DismissalDeliveryPickupRecipientNotFoundException,
  DismissalDeliveryPickupRecipientRequiredException,
} from '../../shared/dismissal.errors';
import {
  normalizePickupCode,
  verifyPickupCode,
} from '../../shared/pickup-code.service';
import { DismissalRealtimeEventsService } from '../../realtime/dismissal-realtime-events.service';
import { requireDismissalRequestQueueScope } from './dismissal-request-queue-scope';
import { isRequestVisibleToStaff } from './list-active-dismissal-requests.use-case';
import { DeliverDismissalRequestDto } from '../dto/deliver-dismissal-request.dto';
import {
  DismissalRequestDeliveryRecord,
  DismissalPickupRecipientRecord,
  DismissalRequestsDeliveryRepository,
  isRequestStillEligibleForVerifiedDelivery,
} from '../infrastructure/dismissal-requests-delivery.repository';
import { DismissalRequestsReadRepository } from '../infrastructure/dismissal-requests-read.repository';
import { presentDismissalRequestDelivery } from '../presenter/dismissal-request-queue.presenter';
import { presentVerifiedReceiver } from '../presenter/dismissal-pickup-recipients.presenter';
import { PickupRecipientTokenService } from './pickup-recipient-token.service';

@Injectable()
export class DeliverDismissalRequestUseCase {
  constructor(
    private readonly dismissalRequestsDeliveryRepository: DismissalRequestsDeliveryRepository,
    private readonly dismissalRequestsReadRepository: DismissalRequestsReadRepository,
    private readonly dismissalRealtimeEvents: DismissalRealtimeEventsService,
    private readonly pickupRecipientTokenService: PickupRecipientTokenService,
  ) {}

  async execute(requestId: string, command: DeliverDismissalRequestDto) {
    const scope = requireDismissalRequestQueueScope();
    const now = new Date();
    const note = normalizeOptionalText(command.note);

    const [request, settings, assignments] = await Promise.all([
      this.dismissalRequestsDeliveryRepository.findRequestForDeliveryById(
        requestId,
      ),
      this.dismissalRequestsDeliveryRepository.findSettings(),
      scope.userType === UserType.DISMISSAL_STAFF
        ? this.dismissalRequestsReadRepository.listActiveStaffAssignments({
            staffUserId: scope.actorId,
            now,
          })
        : Promise.resolve([]),
    ]);

    if (!request) {
      throw new DismissalDeliveryNotFoundException();
    }

    if (
      scope.userType === UserType.DISMISSAL_STAFF &&
      !isRequestVisibleToStaff(requestToQueueRecord(request), assignments)
    ) {
      throw new DismissalDeliveryNotFoundException();
    }

    if (
      request.status === DismissalRequestStatus.CANCELLED ||
      request.status === DismissalRequestStatus.EXPIRED
    ) {
      throw new DismissalDeliveryNotFoundException();
    }

    if (request.status === DismissalRequestStatus.HANDED_OVER) {
      throw new DismissalDeliveryAlreadyDeliveredException();
    }

    if (request.status !== DismissalRequestStatus.READY) {
      throw new DismissalDeliveryNotReadyException();
    }

    if (!isRequestStillEligibleForVerifiedDelivery(request)) {
      throw new DismissalDeliveryPickupRecipientNotAllowedException();
    }

    const pickupCodeRequired = settings?.requirePickupCode ?? true;
    const pickupCodeVerified = this.assertPickupCode({
      request,
      pickupCodeRequired,
      pickupCode: command.pickupCode,
    });
    const pickupRecipient = await this.assertPickupRecipient({
      request,
      token: command.pickupRecipientToken,
      allowDelegatePickup: settings?.allowDelegatePickup ?? false,
    });
    const receiver = presentVerifiedReceiver({ recipient: pickupRecipient });

    const delivered =
      await this.dismissalRequestsDeliveryRepository.deliverWithEventAndAudit({
        schoolId: scope.schoolId,
        requestId: request.id,
        actorUserId: scope.actorId,
        userType: scope.userType,
        organizationId: scope.organizationId,
        deliveredAt: now,
        pickupCodeVerified,
        receiverName: receiver.name,
        receiverRelation: receiver.relation,
        note,
      });

    await this.dismissalRealtimeEvents.publishDelivered({
      schoolId: scope.schoolId,
      requestId: delivered.id,
      previousStatus: DismissalRequestStatus.READY,
    });

    return presentDismissalRequestDelivery({
      request: delivered,
      previousStatus: DismissalRequestStatus.READY,
    });
  }

  private assertPickupCode(params: {
    request: DismissalRequestDeliveryRecord;
    pickupCodeRequired: boolean;
    pickupCode: string | undefined;
  }): boolean {
    const hasPickupCodeInput =
      params.pickupCode !== undefined &&
      params.pickupCode !== null &&
      params.pickupCode.trim().length > 0;
    const normalized = hasPickupCodeInput
      ? normalizePickupCode(params.pickupCode)
      : null;

    if (params.pickupCodeRequired && !hasPickupCodeInput) {
      throw new DismissalDeliveryPickupCodeRequiredException();
    }

    if (hasPickupCodeInput && !normalized) {
      throw new DismissalDeliveryInvalidPickupCodeException();
    }

    if (!params.pickupCodeRequired) {
      return false;
    }

    if (
      !params.request.pickupCodeHash ||
      !params.request.pickupCodeSalt ||
      !params.request.pickupCodeIssuedAt
    ) {
      throw new DismissalDeliveryPickupCodeNotIssuedException();
    }

    if (
      !verifyPickupCode({
        code: normalized as string,
        hash: params.request.pickupCodeHash,
        salt: params.request.pickupCodeSalt,
      })
    ) {
      throw new DismissalDeliveryInvalidPickupCodeException();
    }

    return true;
  }

  private async assertPickupRecipient(params: {
    request: DismissalRequestDeliveryRecord;
    token: string | undefined;
    allowDelegatePickup: boolean;
  }): Promise<DismissalPickupRecipientRecord> {
    const token = params.token?.trim();
    if (!token) {
      throw new DismissalDeliveryPickupRecipientRequiredException();
    }

    const payload = this.pickupRecipientTokenService.verify(token);
    if (
      payload.requestId !== params.request.id ||
      payload.schoolId !== params.request.schoolId ||
      payload.studentId !== params.request.studentId
    ) {
      throw new DismissalDeliveryInvalidPickupRecipientException();
    }

    const recipient =
      await this.dismissalRequestsDeliveryRepository.findPickupRecipientLinkByIds(
        {
          studentId: params.request.studentId,
          studentGuardianId: payload.studentGuardianId,
          guardianId: payload.guardianId,
        },
      );
    if (!recipient) {
      throw new DismissalDeliveryPickupRecipientNotFoundException();
    }

    if (recipient.guardian.canPickup !== true) {
      throw new DismissalDeliveryPickupRecipientNotAllowedException();
    }

    if (
      !params.allowDelegatePickup &&
      recipient.guardian.userId !== params.request.requestedById
    ) {
      throw new DismissalDeliveryPickupRecipientNotAllowedException();
    }

    return recipient;
  }
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requestToQueueRecord(
  request: DismissalRequestDeliveryRecord,
): Parameters<typeof isRequestVisibleToStaff>[0] {
  return request;
}

import { Injectable } from '@nestjs/common';
import { DismissalRequestStatus, UserType } from '@prisma/client';
import {
  DismissalDeliveryAlreadyDeliveredException,
  DismissalDeliveryInvalidPickupCodeException,
  DismissalDeliveryNotFoundException,
  DismissalDeliveryNotReadyException,
  DismissalDeliveryPickupCodeNotIssuedException,
  DismissalDeliveryPickupCodeRequiredException,
} from '../../shared/dismissal.errors';
import {
  normalizePickupCode,
  verifyPickupCode,
} from '../../shared/pickup-code.service';
import { requireDismissalRequestQueueScope } from './dismissal-request-queue-scope';
import { isRequestVisibleToStaff } from './list-active-dismissal-requests.use-case';
import { DeliverDismissalRequestDto } from '../dto/deliver-dismissal-request.dto';
import {
  DismissalRequestDeliveryRecord,
  DismissalRequestsDeliveryRepository,
} from '../infrastructure/dismissal-requests-delivery.repository';
import { DismissalRequestsReadRepository } from '../infrastructure/dismissal-requests-read.repository';
import { presentDismissalRequestDelivery } from '../presenter/dismissal-request-queue.presenter';

@Injectable()
export class DeliverDismissalRequestUseCase {
  constructor(
    private readonly dismissalRequestsDeliveryRepository: DismissalRequestsDeliveryRepository,
    private readonly dismissalRequestsReadRepository: DismissalRequestsReadRepository,
  ) {}

  async execute(requestId: string, command: DeliverDismissalRequestDto) {
    const scope = requireDismissalRequestQueueScope();
    const now = new Date();
    const note = normalizeOptionalText(command.note);
    const receiverName = normalizeOptionalText(command.receiverName);
    const receiverRelation = normalizeOptionalText(command.receiverRelation);

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

    const pickupCodeRequired = settings?.requirePickupCode ?? true;
    const pickupCodeVerified = this.assertPickupCode({
      request,
      pickupCodeRequired,
      pickupCode: command.pickupCode,
    });

    const delivered =
      await this.dismissalRequestsDeliveryRepository.deliverWithEventAndAudit({
        schoolId: scope.schoolId,
        requestId: request.id,
        actorUserId: scope.actorId,
        userType: scope.userType,
        organizationId: scope.organizationId,
        deliveredAt: now,
        pickupCodeVerified,
        receiverName,
        receiverRelation,
        note,
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

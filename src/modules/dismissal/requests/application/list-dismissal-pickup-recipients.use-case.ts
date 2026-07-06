import { Injectable } from '@nestjs/common';
import { DismissalRequestStatus, UserType } from '@prisma/client';
import {
  DismissalDeliveryNotFoundException,
  DismissalDeliveryNotReadyException,
} from '../../shared/dismissal.errors';
import { DismissalPickupRecipientsResponseDto } from '../dto/list-pickup-recipients.dto';
import {
  DismissalPickupRecipientRecord,
  DismissalRequestDeliveryRecord,
  DismissalRequestsDeliveryRepository,
  isRequestStillEligibleForVerifiedDelivery,
} from '../infrastructure/dismissal-requests-delivery.repository';
import { DismissalRequestsReadRepository } from '../infrastructure/dismissal-requests-read.repository';
import { presentDismissalPickupRecipients } from '../presenter/dismissal-pickup-recipients.presenter';
import { isRequestVisibleToStaff } from './list-active-dismissal-requests.use-case';
import { PickupRecipientTokenService } from './pickup-recipient-token.service';
import { requireDismissalRequestQueueScope } from './dismissal-request-queue-scope';

@Injectable()
export class ListDismissalPickupRecipientsUseCase {
  constructor(
    private readonly dismissalRequestsDeliveryRepository: DismissalRequestsDeliveryRepository,
    private readonly dismissalRequestsReadRepository: DismissalRequestsReadRepository,
    private readonly pickupRecipientTokenService: PickupRecipientTokenService,
  ) {}

  async execute(requestId: string): Promise<DismissalPickupRecipientsResponseDto> {
    const scope = requireDismissalRequestQueueScope();
    const now = new Date();

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

    if (request.status !== DismissalRequestStatus.READY) {
      if (isActiveNonReadyStatus(request.status)) {
        throw new DismissalDeliveryNotReadyException();
      }
      throw new DismissalDeliveryNotFoundException();
    }

    if (!isRequestStillEligibleForVerifiedDelivery(request)) {
      throw new DismissalDeliveryNotFoundException();
    }

    const delegatePickupAllowed = settings?.allowDelegatePickup ?? false;
    const pickupCodeRequired = settings?.requirePickupCode ?? true;
    const recipients =
      await this.dismissalRequestsDeliveryRepository.listEligiblePickupRecipients(
        {
          studentId: request.studentId,
          requestedById: request.requestedById,
          allowDelegatePickup: delegatePickupAllowed,
        },
      );

    return presentDismissalPickupRecipients({
      request,
      recipients: recipients.map((recipient) => ({
        record: recipient,
        pickupRecipientToken: this.issueToken({
          request,
          recipient,
          issuedAt: now,
        }),
        isRequestingGuardian: recipient.guardian.userId === request.requestedById,
      })),
      delegatePickupAllowed,
      pickupCodeRequired,
    });
  }

  private issueToken(params: {
    request: DismissalRequestDeliveryRecord;
    recipient: DismissalPickupRecipientRecord;
    issuedAt: Date;
  }): string {
    return this.pickupRecipientTokenService.issue({
      requestId: params.request.id,
      schoolId: params.request.schoolId,
      studentId: params.request.studentId,
      studentGuardianId: params.recipient.id,
      guardianId: params.recipient.guardianId,
      issuedAt: params.issuedAt,
    });
  }
}

function isActiveNonReadyStatus(status: DismissalRequestStatus): boolean {
  const activeNonReadyStatuses: DismissalRequestStatus[] = [
    DismissalRequestStatus.REQUESTED,
    DismissalRequestStatus.QUEUED,
    DismissalRequestStatus.CALLED,
    DismissalRequestStatus.MOVING,
    DismissalRequestStatus.AT_GATE,
  ];

  return activeNonReadyStatuses.includes(status);
}

function requestToQueueRecord(
  request: DismissalRequestDeliveryRecord,
): Parameters<typeof isRequestVisibleToStaff>[0] {
  return request;
}

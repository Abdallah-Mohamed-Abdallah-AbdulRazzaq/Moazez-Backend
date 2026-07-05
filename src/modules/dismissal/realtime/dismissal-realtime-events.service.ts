import { Injectable, Logger } from '@nestjs/common';
import {
  CommunicationNotificationType,
  DismissalRequestStatus,
} from '@prisma/client';
import { REALTIME_SERVER_EVENTS } from '../../../infrastructure/realtime/realtime-event-names';
import { RealtimePublisherService } from '../../../infrastructure/realtime/realtime-publisher.service';
import { DismissalRealtimeRepository } from './dismissal-realtime.repository';
import {
  DismissalRealtimeNotificationRecord,
  DismissalRealtimeRequestReason,
  presentDismissalRealtimeNotification,
  presentDismissalRealtimeNotificationsReadAll,
  presentDismissalRealtimeQueueChanged,
  presentDismissalRealtimeRequestEvent,
  presentParentSmartPickupRealtimeChanged,
} from './dismissal-realtime.presenter';

@Injectable()
export class DismissalRealtimeEventsService {
  private readonly logger = new Logger(DismissalRealtimeEventsService.name);

  constructor(
    private readonly repository: DismissalRealtimeRepository,
    private readonly publisher: RealtimePublisherService,
  ) {}

  publishRequestCreated(params: {
    schoolId: string;
    requestId: string;
  }): Promise<void> {
    return this.publishRequestMutation({
      ...params,
      reason: 'request_created',
      requestEventName: REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_CREATED,
      previousStatus: null,
      notificationTypes: [
        CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      ],
    });
  }

  publishRequestCancelled(params: {
    schoolId: string;
    requestId: string;
    previousStatus: DismissalRequestStatus;
  }): Promise<void> {
    return this.publishRequestMutation({
      ...params,
      reason: 'request_cancelled',
      requestEventName: REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_CANCELLED,
      notificationTypes: [
        CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED,
      ],
    });
  }

  publishStatusChanged(params: {
    schoolId: string;
    requestId: string;
    previousStatus: DismissalRequestStatus;
  }): Promise<void> {
    return this.publishStatusChangedFromCommittedRequest(params);
  }

  publishArrivalConfirmed(params: {
    schoolId: string;
    requestId: string;
    previousStatus: DismissalRequestStatus;
  }): Promise<void> {
    return this.publishRequestMutation({
      ...params,
      reason: 'arrival_confirmed',
      requestEventName:
        REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_ARRIVAL_CONFIRMED,
      notificationTypes: [],
    });
  }

  publishDelivered(params: {
    schoolId: string;
    requestId: string;
    previousStatus: DismissalRequestStatus;
  }): Promise<void> {
    return this.publishRequestMutation({
      ...params,
      reason: 'delivered',
      requestEventName: REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_DELIVERED,
      notificationTypes: [
        CommunicationNotificationType.DISMISSAL_REQUEST_HANDED_OVER,
      ],
    });
  }

  async publishNotificationRead(params: {
    schoolId: string;
    recipientUserId: string;
    notification: DismissalRealtimeNotificationRecord;
    occurredAt: Date;
  }): Promise<void> {
    await this.runSafely('notification_read', async () => {
      this.publisher.publishToUser(
        params.schoolId,
        params.recipientUserId,
        REALTIME_SERVER_EVENTS.DISMISSAL_NOTIFICATION_READ,
        presentDismissalRealtimeNotification({
          notification: params.notification,
          occurredAt: params.occurredAt,
        }),
      );
    });
  }

  async publishNotificationsReadAll(params: {
    schoolId: string;
    recipientUserId: string;
    updatedCount: number;
    occurredAt: Date;
  }): Promise<void> {
    if (params.updatedCount <= 0) return;

    await this.runSafely('notifications_read_all', async () => {
      this.publisher.publishToUser(
        params.schoolId,
        params.recipientUserId,
        REALTIME_SERVER_EVENTS.DISMISSAL_NOTIFICATIONS_READ_ALL,
        presentDismissalRealtimeNotificationsReadAll({
          updatedCount: params.updatedCount,
          occurredAt: params.occurredAt,
        }),
      );
    });
  }

  private async publishStatusChangedFromCommittedRequest(params: {
    schoolId: string;
    requestId: string;
    previousStatus: DismissalRequestStatus;
  }): Promise<void> {
    await this.runSafely('status_changed', async () => {
      const request = await this.repository.findRequest(params);
      if (!request) return;

      const notificationTypes = resolveStatusNotificationTypes(request.status);
      await this.publishRequestMutationForRequest({
        schoolId: params.schoolId,
        request,
        reason: 'status_changed',
        requestEventName:
          REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_STATUS_CHANGED,
        previousStatus: params.previousStatus,
        notificationTypes,
        occurredAt: new Date(),
      });
    });
  }

  private async publishRequestMutation(params: {
    schoolId: string;
    requestId: string;
    reason: DismissalRealtimeRequestReason;
    requestEventName: string;
    previousStatus?: DismissalRequestStatus | null;
    notificationTypes: CommunicationNotificationType[];
  }): Promise<void> {
    await this.runSafely(params.reason, async () => {
      const request = await this.repository.findRequest(params);
      if (!request) return;

      await this.publishRequestMutationForRequest({
        schoolId: params.schoolId,
        request,
        reason: params.reason,
        requestEventName: params.requestEventName,
        previousStatus: params.previousStatus,
        notificationTypes: params.notificationTypes,
        occurredAt: new Date(),
      });
    });
  }

  private async publishRequestMutationForRequest(params: {
    schoolId: string;
    request: NonNullable<
      Awaited<ReturnType<DismissalRealtimeRepository['findRequest']>>
    >;
    reason: DismissalRealtimeRequestReason;
    requestEventName: string;
    previousStatus?: DismissalRequestStatus | null;
    notificationTypes: CommunicationNotificationType[];
    occurredAt: Date;
  }): Promise<void> {
    const [staffRecipientIds, parentCancelPolicy] = await Promise.all([
      this.repository.listMatchingStaffRecipientIds({
        schoolId: params.schoolId,
        request: params.request,
        now: params.occurredAt,
      }),
      this.repository.findParentCancelPolicy({
        schoolId: params.schoolId,
      }),
    ]);

    const requestPayload = presentDismissalRealtimeRequestEvent({
      request: params.request,
      type: params.reason,
      previousStatus: params.previousStatus ?? null,
      occurredAt: params.occurredAt,
    });
    const queuePayload = presentDismissalRealtimeQueueChanged({
      request: params.request,
      reason: params.reason,
      occurredAt: params.occurredAt,
    });

    for (const recipientId of staffRecipientIds) {
      this.publisher.publishToUser(
        params.schoolId,
        recipientId,
        params.requestEventName,
        requestPayload,
      );
      this.publisher.publishToUser(
        params.schoolId,
        recipientId,
        REALTIME_SERVER_EVENTS.DISMISSAL_QUEUE_CHANGED,
        queuePayload,
      );
    }

    this.publisher.publishToUser(
      params.schoolId,
      params.request.requestedById,
      REALTIME_SERVER_EVENTS.PARENT_SMART_PICKUP_REQUEST_CHANGED,
      presentParentSmartPickupRealtimeChanged({
        request: params.request,
        allowParentCancelBeforeCalled:
          parentCancelPolicy?.allowParentCancelBeforeCalled ?? true,
        occurredAt: params.occurredAt,
      }),
    );

    await this.publishCreatedNotifications({
      schoolId: params.schoolId,
      requestId: params.request.id,
      eventTypes: params.notificationTypes,
    });
  }

  private async publishCreatedNotifications(params: {
    schoolId: string;
    requestId: string;
    eventTypes: CommunicationNotificationType[];
  }): Promise<void> {
    const notifications =
      await this.repository.listStaffNotificationsForRequestEvent(params);

    for (const notification of notifications) {
      this.publisher.publishToUser(
        params.schoolId,
        notification.recipientUserId,
        REALTIME_SERVER_EVENTS.DISMISSAL_NOTIFICATION_CREATED,
        presentDismissalRealtimeNotification({ notification }),
      );
    }
  }

  private async runSafely(
    action: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.warn(
        `Dismissal realtime publish skipped for ${action}: ${this.getErrorMessage(
          error,
        )}`,
      );
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'unknown_error';
  }
}

function resolveStatusNotificationTypes(
  status: DismissalRequestStatus,
): CommunicationNotificationType[] {
  switch (status) {
    case DismissalRequestStatus.CALLED:
      return [CommunicationNotificationType.DISMISSAL_REQUEST_CALLED];
    case DismissalRequestStatus.READY:
      return [CommunicationNotificationType.DISMISSAL_REQUEST_READY];
    default:
      return [];
  }
}

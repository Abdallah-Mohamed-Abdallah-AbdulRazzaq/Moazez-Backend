import { Injectable, Logger } from '@nestjs/common';
import { CommunicationNotificationType, UserType } from '@prisma/client';
import { CommunicationNotificationPushQueueService } from '../../../communication/application/communication-notification-push-queue.service';
import { DismissalPushNotificationRepository } from '../infrastructure/dismissal-push-notification.repository';

const DISMISSAL_PUSH_ACTOR_ID = 'dismissal-push-delivery';

@Injectable()
export class DismissalPushNotificationService {
  private readonly logger = new Logger(DismissalPushNotificationService.name);

  constructor(
    private readonly repository: DismissalPushNotificationRepository,
    private readonly pushQueueService: CommunicationNotificationPushQueueService,
  ) {}

  async enqueuePushForRequestEvent(params: {
    schoolId: string;
    requestId: string;
    eventTypes: CommunicationNotificationType[];
  }): Promise<void> {
    const eventTypes = [...new Set(params.eventTypes)];
    if (eventTypes.length === 0) return;

    try {
      const deliveries =
        await this.repository.ensurePushDeliveriesForRequestEvent({
          ...params,
          eventTypes,
          now: new Date(),
        });

      if (deliveries.length === 0) return;

      await Promise.all(
        deliveries.map((delivery) =>
          this.pushQueueService.enqueueNotificationPushDelivery({
            schoolId: params.schoolId,
            organizationId: delivery.organizationId,
            notificationId: delivery.notificationId,
            deliveryId: delivery.id,
            actorUserId: DISMISSAL_PUSH_ACTOR_ID,
            actorUserType: UserType.SERVICE_ACCOUNT,
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Dismissal push enqueue skipped for ${eventTypes
          .map((type) => type.toLowerCase())
          .join(',')}: ${formatPushError(error)}`,
      );
    }
  }
}

function formatPushError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'unknown_error';
}

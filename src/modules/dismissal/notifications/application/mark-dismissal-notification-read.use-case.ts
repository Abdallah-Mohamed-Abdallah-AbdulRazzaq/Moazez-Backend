import { Injectable } from '@nestjs/common';
import {
  DismissalNotificationNotFoundException,
} from '../../shared/dismissal.errors';
import { DismissalRealtimeEventsService } from '../../realtime/dismissal-realtime-events.service';
import { DismissalNotificationReadResponseDto } from '../dto/dismissal-notifications-query.dto';
import { DismissalNotificationsRepository } from '../infrastructure/dismissal-notifications.repository';
import { presentDismissalNotificationRead } from '../presenter/dismissal-notifications.presenter';
import { requireDismissalNotificationScope } from './list-dismissal-notifications.use-case';

@Injectable()
export class MarkDismissalNotificationReadUseCase {
  constructor(
    private readonly dismissalNotificationsRepository: DismissalNotificationsRepository,
    private readonly dismissalRealtimeEvents: DismissalRealtimeEventsService,
  ) {}

  async execute(notificationId: string): Promise<DismissalNotificationReadResponseDto> {
    const scope = requireDismissalNotificationScope();
    const readAt = new Date();
    const notification =
      await this.dismissalNotificationsRepository.markCurrentActorNotificationRead(
        {
          notificationId,
          recipientUserId: scope.actorId,
          readAt,
        },
      );

    if (!notification) {
      throw new DismissalNotificationNotFoundException();
    }

    await this.dismissalRealtimeEvents.publishNotificationRead({
      schoolId: scope.schoolId,
      recipientUserId: scope.actorId,
      notification,
      occurredAt: readAt,
    });

    return presentDismissalNotificationRead(notification);
  }
}

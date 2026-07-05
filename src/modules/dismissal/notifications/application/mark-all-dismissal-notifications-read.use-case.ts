import { Injectable } from '@nestjs/common';
import { DismissalRealtimeEventsService } from '../../realtime/dismissal-realtime-events.service';
import { DismissalNotificationsReadAllResponseDto } from '../dto/dismissal-notifications-query.dto';
import { DismissalNotificationsRepository } from '../infrastructure/dismissal-notifications.repository';
import { requireDismissalNotificationScope } from './list-dismissal-notifications.use-case';

@Injectable()
export class MarkAllDismissalNotificationsReadUseCase {
  constructor(
    private readonly dismissalNotificationsRepository: DismissalNotificationsRepository,
    private readonly dismissalRealtimeEvents: DismissalRealtimeEventsService,
  ) {}

  async execute(): Promise<DismissalNotificationsReadAllResponseDto> {
    const scope = requireDismissalNotificationScope();
    const readAt = new Date();
    const result =
      await this.dismissalNotificationsRepository.markAllCurrentActorNotificationsRead(
        {
          recipientUserId: scope.actorId,
          readAt,
        },
      );

    await this.dismissalRealtimeEvents.publishNotificationsReadAll({
      schoolId: scope.schoolId,
      recipientUserId: scope.actorId,
      updatedCount: result.updatedCount,
      occurredAt: readAt,
    });

    return result;
  }
}

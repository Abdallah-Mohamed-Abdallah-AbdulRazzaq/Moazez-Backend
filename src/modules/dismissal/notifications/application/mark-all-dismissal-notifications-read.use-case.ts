import { Injectable } from '@nestjs/common';
import { DismissalNotificationsReadAllResponseDto } from '../dto/dismissal-notifications-query.dto';
import { DismissalNotificationsRepository } from '../infrastructure/dismissal-notifications.repository';
import { requireDismissalNotificationScope } from './list-dismissal-notifications.use-case';

@Injectable()
export class MarkAllDismissalNotificationsReadUseCase {
  constructor(
    private readonly dismissalNotificationsRepository: DismissalNotificationsRepository,
  ) {}

  async execute(): Promise<DismissalNotificationsReadAllResponseDto> {
    const scope = requireDismissalNotificationScope();
    return this.dismissalNotificationsRepository.markAllCurrentActorNotificationsRead(
      {
        recipientUserId: scope.actorId,
        readAt: new Date(),
      },
    );
  }
}

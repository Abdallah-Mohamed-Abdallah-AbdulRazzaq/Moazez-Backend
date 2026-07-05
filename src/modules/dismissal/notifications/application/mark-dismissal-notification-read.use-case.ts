import { Injectable } from '@nestjs/common';
import {
  DismissalNotificationNotFoundException,
} from '../../shared/dismissal.errors';
import { DismissalNotificationReadResponseDto } from '../dto/dismissal-notifications-query.dto';
import { DismissalNotificationsRepository } from '../infrastructure/dismissal-notifications.repository';
import { presentDismissalNotificationRead } from '../presenter/dismissal-notifications.presenter';
import { requireDismissalNotificationScope } from './list-dismissal-notifications.use-case';

@Injectable()
export class MarkDismissalNotificationReadUseCase {
  constructor(
    private readonly dismissalNotificationsRepository: DismissalNotificationsRepository,
  ) {}

  async execute(notificationId: string): Promise<DismissalNotificationReadResponseDto> {
    const scope = requireDismissalNotificationScope();
    const notification =
      await this.dismissalNotificationsRepository.markCurrentActorNotificationRead(
        {
          notificationId,
          recipientUserId: scope.actorId,
          readAt: new Date(),
        },
      );

    if (!notification) {
      throw new DismissalNotificationNotFoundException();
    }

    return presentDismissalNotificationRead(notification);
  }
}

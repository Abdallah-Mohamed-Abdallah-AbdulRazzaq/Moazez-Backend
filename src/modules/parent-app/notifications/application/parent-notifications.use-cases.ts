import { Injectable } from '@nestjs/common';
import { CommunicationAppNotificationCenterService } from '../../../communication/application/communication-app-notification-center.service';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ListParentNotificationsQueryDto,
  ParentNotificationResponseDto,
  ParentNotificationsListResponseDto,
  ParentNotificationsReadAllResponseDto,
  ParentNotificationsSummaryDto,
} from '../dto/parent-notifications.dto';

const PARENT_NOTIFICATION_ALIAS_STYLE = 'dual' as const;

@Injectable()
export class ListParentNotificationsUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(
    query: ListParentNotificationsQueryDto = {},
  ): Promise<ParentNotificationsListResponseDto> {
    const context = await this.accessService.assertCurrentParent();

    return this.notificationCenter.listForActor({
      recipientUserId: context.parentUserId,
      query,
      aliasStyle: PARENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<ParentNotificationsListResponseDto>;
  }
}

@Injectable()
export class GetParentNotificationUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(notificationId: string): Promise<ParentNotificationResponseDto> {
    const context = await this.accessService.assertCurrentParent();

    return this.notificationCenter.getForActor({
      recipientUserId: context.parentUserId,
      notificationId,
      aliasStyle: PARENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<ParentNotificationResponseDto>;
  }
}

@Injectable()
export class GetParentNotificationsSummaryUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(): Promise<ParentNotificationsSummaryDto> {
    const context = await this.accessService.assertCurrentParent();

    return this.notificationCenter.summaryForActor({
      recipientUserId: context.parentUserId,
      aliasStyle: PARENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<ParentNotificationsSummaryDto>;
  }
}

@Injectable()
export class MarkParentNotificationReadUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(notificationId: string): Promise<ParentNotificationResponseDto> {
    const context = await this.accessService.assertCurrentParent();

    return this.notificationCenter.markReadForActor({
      recipientUserId: context.parentUserId,
      notificationId,
      aliasStyle: PARENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<ParentNotificationResponseDto>;
  }
}

@Injectable()
export class MarkAllParentNotificationsReadUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(): Promise<ParentNotificationsReadAllResponseDto> {
    const context = await this.accessService.assertCurrentParent();

    return this.notificationCenter.markAllReadForActor({
      recipientUserId: context.parentUserId,
      aliasStyle: PARENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<ParentNotificationsReadAllResponseDto>;
  }
}

@Injectable()
export class ArchiveParentNotificationUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(notificationId: string): Promise<ParentNotificationResponseDto> {
    const context = await this.accessService.assertCurrentParent();

    return this.notificationCenter.archiveForActor({
      recipientUserId: context.parentUserId,
      notificationId,
      aliasStyle: PARENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<ParentNotificationResponseDto>;
  }
}

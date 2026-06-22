import { Injectable } from '@nestjs/common';
import { AppDeviceTokenSurface } from '@prisma/client';
import { AppDeviceTokenService } from '../../../app-device-tokens/application/app-device-token.service';
import {
  AppDeviceTokenDualRegisterResponseDto,
  AppDeviceTokenDualUnregisterResponseDto,
  RegisterAppDeviceTokenDto,
  UnregisterAppDeviceTokenDto,
} from '../../../app-device-tokens/dto/app-device-token.dto';
import { CommunicationAppNotificationCenterService } from '../../../communication/application/communication-app-notification-center.service';
import { CommunicationNotificationPreferenceService } from '../../../communication/application/communication-notification-preference.service';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ListParentNotificationsQueryDto,
  ParentNotificationResponseDto,
  ParentNotificationPreferencesResponseDto,
  ParentNotificationsListResponseDto,
  ParentNotificationsReadAllResponseDto,
  ParentNotificationsSummaryDto,
  UpdateParentNotificationPreferencesDto,
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

@Injectable()
export class GetParentNotificationPreferencesUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly preferenceService: CommunicationNotificationPreferenceService,
  ) {}

  async execute(): Promise<ParentNotificationPreferencesResponseDto> {
    const context = await this.accessService.assertCurrentParent();

    return this.preferenceService.getPreferencesForActor({
      schoolId: context.schoolId,
      userId: context.parentUserId,
      aliasStyle: PARENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<ParentNotificationPreferencesResponseDto>;
  }
}

@Injectable()
export class UpdateParentNotificationPreferencesUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly preferenceService: CommunicationNotificationPreferenceService,
  ) {}

  async execute(
    dto: UpdateParentNotificationPreferencesDto,
  ): Promise<ParentNotificationPreferencesResponseDto> {
    const context = await this.accessService.assertCurrentParent();

    return this.preferenceService.updatePreferencesForActor({
      schoolId: context.schoolId,
      userId: context.parentUserId,
      preferences: dto.preferences,
      aliasStyle: PARENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<ParentNotificationPreferencesResponseDto>;
  }
}

@Injectable()
export class RegisterParentDeviceTokenUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly deviceTokenService: AppDeviceTokenService,
  ) {}

  async execute(
    dto: RegisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenDualRegisterResponseDto> {
    const context = await this.accessService.assertCurrentParent();

    return this.deviceTokenService.registerForActor({
      schoolId: context.schoolId,
      userId: context.parentUserId,
      appSurface: AppDeviceTokenSurface.PARENT,
      body: dto,
      aliasStyle: PARENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<AppDeviceTokenDualRegisterResponseDto>;
  }
}

@Injectable()
export class UnregisterParentDeviceTokenUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly deviceTokenService: AppDeviceTokenService,
  ) {}

  async execute(
    dto: UnregisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenDualUnregisterResponseDto> {
    const context = await this.accessService.assertCurrentParent();

    return this.deviceTokenService.unregisterForActor({
      schoolId: context.schoolId,
      userId: context.parentUserId,
      appSurface: AppDeviceTokenSurface.PARENT,
      body: dto,
      aliasStyle: PARENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<AppDeviceTokenDualUnregisterResponseDto>;
  }
}

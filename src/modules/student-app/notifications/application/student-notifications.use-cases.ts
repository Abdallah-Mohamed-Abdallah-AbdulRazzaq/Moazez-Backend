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
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  ListStudentNotificationsQueryDto,
  StudentNotificationResponseDto,
  StudentNotificationPreferencesResponseDto,
  StudentNotificationsListResponseDto,
  StudentNotificationsReadAllResponseDto,
  StudentNotificationsSummaryDto,
  UpdateStudentNotificationPreferencesDto,
} from '../dto/student-notifications.dto';

const STUDENT_NOTIFICATION_ALIAS_STYLE = 'dual' as const;

@Injectable()
export class ListStudentNotificationsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(
    query: ListStudentNotificationsQueryDto = {},
  ): Promise<StudentNotificationsListResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();

    return this.notificationCenter.listForActor({
      recipientUserId: context.studentUserId,
      query,
      aliasStyle: STUDENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<StudentNotificationsListResponseDto>;
  }
}

@Injectable()
export class GetStudentNotificationUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(notificationId: string): Promise<StudentNotificationResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();

    return this.notificationCenter.getForActor({
      recipientUserId: context.studentUserId,
      notificationId,
      aliasStyle: STUDENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<StudentNotificationResponseDto>;
  }
}

@Injectable()
export class GetStudentNotificationsSummaryUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(): Promise<StudentNotificationsSummaryDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();

    return this.notificationCenter.summaryForActor({
      recipientUserId: context.studentUserId,
      aliasStyle: STUDENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<StudentNotificationsSummaryDto>;
  }
}

@Injectable()
export class MarkStudentNotificationReadUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(notificationId: string): Promise<StudentNotificationResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();

    return this.notificationCenter.markReadForActor({
      recipientUserId: context.studentUserId,
      notificationId,
      aliasStyle: STUDENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<StudentNotificationResponseDto>;
  }
}

@Injectable()
export class MarkAllStudentNotificationsReadUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(): Promise<StudentNotificationsReadAllResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();

    return this.notificationCenter.markAllReadForActor({
      recipientUserId: context.studentUserId,
      aliasStyle: STUDENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<StudentNotificationsReadAllResponseDto>;
  }
}

@Injectable()
export class ArchiveStudentNotificationUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(notificationId: string): Promise<StudentNotificationResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();

    return this.notificationCenter.archiveForActor({
      recipientUserId: context.studentUserId,
      notificationId,
      aliasStyle: STUDENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<StudentNotificationResponseDto>;
  }
}

@Injectable()
export class GetStudentNotificationPreferencesUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly preferenceService: CommunicationNotificationPreferenceService,
  ) {}

  async execute(): Promise<StudentNotificationPreferencesResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();

    return this.preferenceService.getPreferencesForActor({
      schoolId: context.schoolId,
      userId: context.studentUserId,
      aliasStyle: STUDENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<StudentNotificationPreferencesResponseDto>;
  }
}

@Injectable()
export class RegisterStudentDeviceTokenUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly deviceTokenService: AppDeviceTokenService,
  ) {}

  async execute(
    dto: RegisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenDualRegisterResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();

    return this.deviceTokenService.registerForActor({
      schoolId: context.schoolId,
      userId: context.studentUserId,
      appSurface: AppDeviceTokenSurface.STUDENT,
      body: dto,
      aliasStyle: STUDENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<AppDeviceTokenDualRegisterResponseDto>;
  }
}

@Injectable()
export class UnregisterStudentDeviceTokenUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly deviceTokenService: AppDeviceTokenService,
  ) {}

  async execute(
    dto: UnregisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenDualUnregisterResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();

    return this.deviceTokenService.unregisterForActor({
      schoolId: context.schoolId,
      userId: context.studentUserId,
      appSurface: AppDeviceTokenSurface.STUDENT,
      body: dto,
      aliasStyle: STUDENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<AppDeviceTokenDualUnregisterResponseDto>;
  }
}

@Injectable()
export class UpdateStudentNotificationPreferencesUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly preferenceService: CommunicationNotificationPreferenceService,
  ) {}

  async execute(
    dto: UpdateStudentNotificationPreferencesDto,
  ): Promise<StudentNotificationPreferencesResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();

    return this.preferenceService.updatePreferencesForActor({
      schoolId: context.schoolId,
      userId: context.studentUserId,
      preferences: dto.preferences,
      aliasStyle: STUDENT_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<StudentNotificationPreferencesResponseDto>;
  }
}

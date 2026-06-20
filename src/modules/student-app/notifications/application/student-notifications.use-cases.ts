import { Injectable } from '@nestjs/common';
import { CommunicationAppNotificationCenterService } from '../../../communication/application/communication-app-notification-center.service';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  ListStudentNotificationsQueryDto,
  StudentNotificationResponseDto,
  StudentNotificationsListResponseDto,
  StudentNotificationsReadAllResponseDto,
  StudentNotificationsSummaryDto,
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

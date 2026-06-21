import { Injectable } from '@nestjs/common';
import { CommunicationAppNotificationCenterService } from '../../../communication/application/communication-app-notification-center.service';
import { CommunicationNotificationPreferenceService } from '../../../communication/application/communication-notification-preference.service';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  ListTeacherNotificationsQueryDto,
  TeacherNotificationPreferencesResponseDto,
  UpdateTeacherNotificationPreferencesDto,
} from '../dto/teacher-notifications.dto';

const TEACHER_NOTIFICATION_ALIAS_STYLE = 'camel' as const;

@Injectable()
export class ListTeacherNotificationsUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(query: ListTeacherNotificationsQueryDto = {}) {
    const context = this.accessService.assertCurrentTeacher();

    return this.notificationCenter.listForActor({
      recipientUserId: context.teacherUserId,
      query,
      aliasStyle: TEACHER_NOTIFICATION_ALIAS_STYLE,
    });
  }
}

@Injectable()
export class GetTeacherNotificationUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(notificationId: string) {
    const context = this.accessService.assertCurrentTeacher();

    return this.notificationCenter.getForActor({
      recipientUserId: context.teacherUserId,
      notificationId,
      aliasStyle: TEACHER_NOTIFICATION_ALIAS_STYLE,
    });
  }
}

@Injectable()
export class GetTeacherNotificationsSummaryUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute() {
    const context = this.accessService.assertCurrentTeacher();

    return this.notificationCenter.summaryForActor({
      recipientUserId: context.teacherUserId,
      aliasStyle: TEACHER_NOTIFICATION_ALIAS_STYLE,
    });
  }
}

@Injectable()
export class MarkTeacherNotificationReadUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(notificationId: string) {
    const context = this.accessService.assertCurrentTeacher();

    return this.notificationCenter.markReadForActor({
      recipientUserId: context.teacherUserId,
      notificationId,
      aliasStyle: TEACHER_NOTIFICATION_ALIAS_STYLE,
    });
  }
}

@Injectable()
export class MarkAllTeacherNotificationsReadUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute() {
    const context = this.accessService.assertCurrentTeacher();

    return this.notificationCenter.markAllReadForActor({
      recipientUserId: context.teacherUserId,
      aliasStyle: TEACHER_NOTIFICATION_ALIAS_STYLE,
    });
  }
}

@Injectable()
export class ArchiveTeacherNotificationUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly notificationCenter: CommunicationAppNotificationCenterService,
  ) {}

  async execute(notificationId: string) {
    const context = this.accessService.assertCurrentTeacher();

    return this.notificationCenter.archiveForActor({
      recipientUserId: context.teacherUserId,
      notificationId,
      aliasStyle: TEACHER_NOTIFICATION_ALIAS_STYLE,
    });
  }
}

@Injectable()
export class GetTeacherNotificationPreferencesUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly preferenceService: CommunicationNotificationPreferenceService,
  ) {}

  execute(): Promise<TeacherNotificationPreferencesResponseDto> {
    const context = this.accessService.assertCurrentTeacher();

    return this.preferenceService.getPreferencesForActor({
      schoolId: context.schoolId,
      userId: context.teacherUserId,
      aliasStyle: TEACHER_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<TeacherNotificationPreferencesResponseDto>;
  }
}

@Injectable()
export class UpdateTeacherNotificationPreferencesUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly preferenceService: CommunicationNotificationPreferenceService,
  ) {}

  execute(
    dto: UpdateTeacherNotificationPreferencesDto,
  ): Promise<TeacherNotificationPreferencesResponseDto> {
    const context = this.accessService.assertCurrentTeacher();

    return this.preferenceService.updatePreferencesForActor({
      schoolId: context.schoolId,
      userId: context.teacherUserId,
      preferences: dto.preferences,
      aliasStyle: TEACHER_NOTIFICATION_ALIAS_STYLE,
    }) as Promise<TeacherNotificationPreferencesResponseDto>;
  }
}

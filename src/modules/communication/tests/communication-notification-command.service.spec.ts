import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationPreferenceCategory,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
} from '@prisma/client';
import { CommunicationNotificationCommandService } from '../application/communication-notification-command.service';
import { CommunicationNotificationInvalidException } from '../domain/communication-notification-domain';
import { CommunicationNotificationCommandRepository } from '../infrastructure/communication-notification-command.repository';
import { CommunicationNotificationPreferenceService } from '../application/communication-notification-preference.service';

describe('CommunicationNotificationCommandService', () => {
  it('creates through the reusable repository with normalized idempotency and attendance preference checks', async () => {
    const repository = repositoryMock();
    const preferences = preferenceServiceMock({
      shouldCreateInAppNotification: jest.fn().mockResolvedValue(true),
    });
    const service = new CommunicationNotificationCommandService(
      repository,
      preferences,
    );

    const result = await service.createOrReuseNotification({
      schoolId: 'school-1',
      recipientUserId: 'guardian-user-1',
      sourceModule: CommunicationNotificationSourceModule.ATTENDANCE,
      sourceType: ' attendance_incident ',
      sourceId: null,
      idempotencyKey: ' attendance:submit:entry-1:absent ',
      type: CommunicationNotificationType.ATTENDANCE_ABSENCE,
      title: ' Attendance update ',
      body: ' Student absent ',
      preferenceCategory: CommunicationNotificationPreferenceCategory.ATTENDANCE,
    });

    expect(result).toMatchObject({
      createdNotification: true,
      skippedReason: null,
    });
    expect(preferences.shouldCreateInAppNotification).toHaveBeenCalledWith({
      schoolId: 'school-1',
      recipientUserId: 'guardian-user-1',
      category: CommunicationNotificationPreferenceCategory.ATTENDANCE,
    });
    expect(
      repository.createOrReuseCurrentSchoolNotification,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'attendance_incident',
        idempotencyKey: 'attendance:submit:entry-1:absent',
        title: 'Attendance update',
        body: 'Student absent',
        priority: CommunicationNotificationPriority.NORMAL,
        deliveryChannels: [CommunicationNotificationDeliveryChannel.IN_APP],
      }),
    );
  });

  it('skips creation when the recipient disables the attendance in-app category', async () => {
    const repository = repositoryMock();
    const preferences = preferenceServiceMock({
      shouldCreateInAppNotification: jest.fn().mockResolvedValue(false),
    });
    const service = new CommunicationNotificationCommandService(
      repository,
      preferences,
    );

    const result = await service.createOrReuseNotification({
      schoolId: 'school-1',
      recipientUserId: 'guardian-user-1',
      sourceModule: CommunicationNotificationSourceModule.ATTENDANCE,
      sourceType: 'attendance_incident',
      idempotencyKey: 'attendance:submit:entry-1:absent',
      type: CommunicationNotificationType.ATTENDANCE_ABSENCE,
      title: 'Attendance update',
      body: 'Student absent',
      preferenceCategory: CommunicationNotificationPreferenceCategory.ATTENDANCE,
    });

    expect(result).toEqual({
      notification: null,
      createdNotification: false,
      reusedExistingNotification: false,
      createdDeliveryCount: 0,
      existingDeliveryCount: 0,
      skippedReason: 'in_app_preference_disabled',
    });
    expect(
      repository.createOrReuseCurrentSchoolNotification,
    ).not.toHaveBeenCalled();
  });

  it('rejects unsupported delivery channels and empty idempotency keys', async () => {
    const service = new CommunicationNotificationCommandService(
      repositoryMock(),
      preferenceServiceMock(),
    );

    await expect(
      service.createOrReuseNotification({
        schoolId: 'school-1',
        recipientUserId: 'guardian-user-1',
        sourceModule: CommunicationNotificationSourceModule.ATTENDANCE,
        sourceType: 'attendance_incident',
        idempotencyKey: ' ',
        type: CommunicationNotificationType.ATTENDANCE_EARLY_LEAVE,
        title: 'Attendance update',
        body: 'Student left early',
      }),
    ).rejects.toThrow(CommunicationNotificationInvalidException);

    await expect(
      service.createOrReuseNotification({
        schoolId: 'school-1',
        recipientUserId: 'guardian-user-1',
        sourceModule: CommunicationNotificationSourceModule.ATTENDANCE,
        sourceType: 'attendance_incident',
        type: CommunicationNotificationType.ATTENDANCE_EARLY_LEAVE,
        title: 'Attendance update',
        body: 'Student left early',
        deliveryChannels: [CommunicationNotificationDeliveryChannel.PUSH],
      }),
    ).rejects.toThrow(CommunicationNotificationInvalidException);
  });
});

function repositoryMock(): CommunicationNotificationCommandRepository &
  Record<string, jest.Mock> {
  return {
    createOrReuseCurrentSchoolNotification: jest.fn().mockResolvedValue({
      notification: {
        id: 'notification-1',
      },
      createdNotification: true,
      reusedExistingNotification: false,
      createdDeliveryCount: 1,
      existingDeliveryCount: 0,
    }),
  } as unknown as CommunicationNotificationCommandRepository &
    Record<string, jest.Mock>;
}

function preferenceServiceMock(
  overrides?: Record<string, unknown>,
): CommunicationNotificationPreferenceService & Record<string, jest.Mock> {
  return {
    shouldCreateInAppNotification: jest.fn().mockResolvedValue(true),
    ...(overrides ?? {}),
  } as unknown as CommunicationNotificationPreferenceService &
    Record<string, jest.Mock>;
}

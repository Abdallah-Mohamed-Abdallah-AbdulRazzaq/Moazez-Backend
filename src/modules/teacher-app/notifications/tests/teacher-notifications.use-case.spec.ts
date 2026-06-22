import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { AppDeviceTokenSurface } from '@prisma/client';
import { AppDeviceTokenService } from '../../../app-device-tokens/application/app-device-token.service';
import {
  RegisterAppDeviceTokenDto,
  UnregisterAppDeviceTokenDto,
} from '../../../app-device-tokens/dto/app-device-token.dto';
import { CommunicationAppNotificationCenterService } from '../../../communication/application/communication-app-notification-center.service';
import { CommunicationNotificationPreferenceService } from '../../../communication/application/communication-notification-preference.service';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppContext } from '../../shared/teacher-app-context';
import { TeacherAppRequiredTeacherException } from '../../shared/teacher-app.errors';
import {
  ArchiveTeacherNotificationUseCase,
  GetTeacherNotificationPreferencesUseCase,
  GetTeacherNotificationUseCase,
  GetTeacherNotificationsSummaryUseCase,
  ListTeacherNotificationsUseCase,
  MarkAllTeacherNotificationsReadUseCase,
  MarkTeacherNotificationReadUseCase,
  RegisterTeacherDeviceTokenUseCase,
  UnregisterTeacherDeviceTokenUseCase,
  UpdateTeacherNotificationPreferencesUseCase,
} from '../application/teacher-notifications.use-cases';
import {
  ListTeacherNotificationsQueryDto,
  UpdateTeacherNotificationPreferencesDto,
} from '../dto/teacher-notifications.dto';

describe('Teacher notifications use cases', () => {
  it('rejects non-teacher actors through TeacherAppAccessService', async () => {
    const { listUseCase, accessService, notificationCenter } = createUseCases();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'teacher_app.actor.required_teacher',
    });
    expect(notificationCenter.listForActor).not.toHaveBeenCalled();
  });

  it('delegates list/detail/read/read-all/archive for the current teacher only', async () => {
    const {
      listUseCase,
      getUseCase,
      summaryUseCase,
      markReadUseCase,
      markAllReadUseCase,
      archiveUseCase,
      notificationCenter,
    } = createUseCases();

    const query = {
      createdFrom: '2026-06-21T00:00:00.000Z',
      createdTo: '2026-06-22T00:00:00.000Z',
      unreadOnly: 'true',
      category: 'message_received',
      sourceModule: 'communication',
      groupBy: 'sourceModule',
      limit: 10,
    };

    await listUseCase.execute(query);
    await summaryUseCase.execute();
    await getUseCase.execute('notification-1');
    await markReadUseCase.execute('notification-1');
    await markAllReadUseCase.execute();
    await archiveUseCase.execute('notification-1');

    expect(notificationCenter.listForActor).toHaveBeenCalledWith({
      recipientUserId: 'teacher-user-1',
      query,
      aliasStyle: 'camel',
    });
    expect(notificationCenter.summaryForActor).toHaveBeenCalledWith({
      recipientUserId: 'teacher-user-1',
      aliasStyle: 'camel',
    });
    expect(notificationCenter.getForActor).toHaveBeenCalledWith({
      recipientUserId: 'teacher-user-1',
      notificationId: 'notification-1',
      aliasStyle: 'camel',
    });
    expect(notificationCenter.markReadForActor).toHaveBeenCalledWith({
      recipientUserId: 'teacher-user-1',
      notificationId: 'notification-1',
      aliasStyle: 'camel',
    });
    expect(notificationCenter.markAllReadForActor).toHaveBeenCalledWith({
      recipientUserId: 'teacher-user-1',
      aliasStyle: 'camel',
    });
    expect(notificationCenter.archiveForActor).toHaveBeenCalledWith({
      recipientUserId: 'teacher-user-1',
      notificationId: 'notification-1',
      aliasStyle: 'camel',
    });
  });

  it('delegates preferences get/update for the current teacher only', async () => {
    const {
      getPreferencesUseCase,
      updatePreferencesUseCase,
      preferenceService,
    } = createUseCases();

    await getPreferencesUseCase.execute();
    await updatePreferencesUseCase.execute({
      preferences: [
        { category: 'message_received', inAppEnabled: false },
        { category: 'announcement', inAppEnabled: true },
      ],
    });

    expect(preferenceService.getPreferencesForActor).toHaveBeenCalledWith({
      schoolId: 'school-1',
      userId: 'teacher-user-1',
      aliasStyle: 'camel',
    });
    expect(preferenceService.updatePreferencesForActor).toHaveBeenCalledWith({
      schoolId: 'school-1',
      userId: 'teacher-user-1',
      aliasStyle: 'camel',
      preferences: [
        { category: 'message_received', inAppEnabled: false },
        { category: 'announcement', inAppEnabled: true },
      ],
    });
  });

  it('registers and unregisters device tokens for the current teacher only', async () => {
    const {
      registerDeviceTokenUseCase,
      unregisterDeviceTokenUseCase,
      deviceTokenService,
    } = createUseCases();
    const registerDto: RegisterAppDeviceTokenDto = {
      token: 'fcm-token-value-for-teacher-device',
      platform: 'web',
      deviceId: 'teacher-device',
    };
    const unregisterDto: UnregisterAppDeviceTokenDto = {
      token: 'fcm-token-value-for-teacher-device',
      deviceId: 'teacher-device',
    };

    await registerDeviceTokenUseCase.execute(registerDto);
    await unregisterDeviceTokenUseCase.execute(unregisterDto);

    expect(deviceTokenService.registerForActor).toHaveBeenCalledWith({
      schoolId: 'school-1',
      userId: 'teacher-user-1',
      appSurface: AppDeviceTokenSurface.TEACHER,
      body: registerDto,
      aliasStyle: 'camel',
    });
    expect(deviceTokenService.unregisterForActor).toHaveBeenCalledWith({
      schoolId: 'school-1',
      userId: 'teacher-user-1',
      appSurface: AppDeviceTokenSurface.TEACHER,
      body: unregisterDto,
      aliasStyle: 'camel',
    });
  });

  it('list query DTO rejects recipientUserId ownership override attempts', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: 'query',
      metatype: ListTeacherNotificationsQueryDto,
      data: '',
    };

    await expect(
      pipe.transform(
        {
          status: 'unread',
          recipientUserId: 'other-user-1',
        },
        metadata,
      ),
    ).rejects.toBeDefined();
  });

  it('list query DTO accepts Phase B filters and rejects unsafe values', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: 'query',
      metatype: ListTeacherNotificationsQueryDto,
      data: '',
    };

    await expect(
      pipe.transform(
        {
          createdFrom: '2026-06-21T00:00:00.000Z',
          createdTo: '2026-06-22T00:00:00.000Z',
          unreadOnly: 'TRUE',
          category: 'ANNOUNCEMENT_PUBLISHED',
          sourceModule: 'announcements',
          groupBy: 'sourceModule',
        },
        metadata,
      ),
    ).resolves.toMatchObject({
      createdFrom: '2026-06-21T00:00:00.000Z',
      createdTo: '2026-06-22T00:00:00.000Z',
      unreadOnly: 'true',
      category: 'announcement_published',
      sourceModule: 'announcements',
      groupBy: 'sourceModule',
    });
    await expect(
      pipe.transform(
        {
          category: 'system_alert',
        },
        metadata,
      ),
    ).rejects.toBeDefined();
    await expect(
      pipe.transform(
        {
          groupBy: 'recipientUserId',
        },
        metadata,
      ),
    ).rejects.toBeDefined();
  });

  it('preference update DTO rejects user ownership override attempts', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: 'body',
      metatype: UpdateTeacherNotificationPreferencesDto,
      data: '',
    };

    await expect(
      pipe.transform(
        {
          actorUserId: 'other-user-1',
          preferences: [
            {
              category: 'message_received',
              inAppEnabled: false,
            },
          ],
        },
        metadata,
      ),
    ).rejects.toBeDefined();
  });
});

function createUseCases(): {
  listUseCase: ListTeacherNotificationsUseCase;
  getUseCase: GetTeacherNotificationUseCase;
  summaryUseCase: GetTeacherNotificationsSummaryUseCase;
  markReadUseCase: MarkTeacherNotificationReadUseCase;
  markAllReadUseCase: MarkAllTeacherNotificationsReadUseCase;
  archiveUseCase: ArchiveTeacherNotificationUseCase;
  getPreferencesUseCase: GetTeacherNotificationPreferencesUseCase;
  updatePreferencesUseCase: UpdateTeacherNotificationPreferencesUseCase;
  registerDeviceTokenUseCase: RegisterTeacherDeviceTokenUseCase;
  unregisterDeviceTokenUseCase: UnregisterTeacherDeviceTokenUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  notificationCenter: jest.Mocked<CommunicationAppNotificationCenterService>;
  preferenceService: jest.Mocked<CommunicationNotificationPreferenceService>;
  deviceTokenService: jest.Mocked<AppDeviceTokenService>;
} {
  const accessService = {
    assertCurrentTeacher: jest.fn(() => contextFixture()),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const notificationCenter = notificationCenterMock();
  const preferenceService = preferenceServiceMock();
  const deviceTokenService = deviceTokenServiceMock();

  return {
    listUseCase: new ListTeacherNotificationsUseCase(
      accessService,
      notificationCenter,
    ),
    getUseCase: new GetTeacherNotificationUseCase(
      accessService,
      notificationCenter,
    ),
    summaryUseCase: new GetTeacherNotificationsSummaryUseCase(
      accessService,
      notificationCenter,
    ),
    markReadUseCase: new MarkTeacherNotificationReadUseCase(
      accessService,
      notificationCenter,
    ),
    markAllReadUseCase: new MarkAllTeacherNotificationsReadUseCase(
      accessService,
      notificationCenter,
    ),
    archiveUseCase: new ArchiveTeacherNotificationUseCase(
      accessService,
      notificationCenter,
    ),
    getPreferencesUseCase: new GetTeacherNotificationPreferencesUseCase(
      accessService,
      preferenceService,
    ),
    updatePreferencesUseCase: new UpdateTeacherNotificationPreferencesUseCase(
      accessService,
      preferenceService,
    ),
    registerDeviceTokenUseCase: new RegisterTeacherDeviceTokenUseCase(
      accessService,
      deviceTokenService,
    ),
    unregisterDeviceTokenUseCase: new UnregisterTeacherDeviceTokenUseCase(
      accessService,
      deviceTokenService,
    ),
    accessService,
    notificationCenter,
    preferenceService,
    deviceTokenService,
  };
}

function notificationCenterMock(): jest.Mocked<CommunicationAppNotificationCenterService> {
  return {
    listForActor: jest.fn().mockResolvedValue({ notifications: [] }),
    summaryForActor: jest.fn().mockResolvedValue({ unreadCount: 0 }),
    getForActor: jest.fn().mockResolvedValue({ notification: {} }),
    markReadForActor: jest.fn().mockResolvedValue({ notification: {} }),
    markAllReadForActor: jest.fn().mockResolvedValue({ markedCount: 0 }),
    archiveForActor: jest.fn().mockResolvedValue({ notification: {} }),
  } as unknown as jest.Mocked<CommunicationAppNotificationCenterService>;
}

function preferenceServiceMock(): jest.Mocked<CommunicationNotificationPreferenceService> {
  return {
    getPreferencesForActor: jest.fn().mockResolvedValue({ preferences: [] }),
    updatePreferencesForActor: jest.fn().mockResolvedValue({ preferences: [] }),
    shouldCreateInAppNotification: jest.fn().mockResolvedValue(true),
    filterInAppEnabledRecipientUserIds: jest.fn(),
  } as unknown as jest.Mocked<CommunicationNotificationPreferenceService>;
}

function deviceTokenServiceMock(): jest.Mocked<AppDeviceTokenService> {
  return {
    registerForActor: jest.fn().mockResolvedValue({
      deviceTokenId: 'device-token-1',
      platform: 'web',
      appSurface: 'teacher',
      isActive: true,
    }),
    unregisterForActor: jest.fn().mockResolvedValue({
      deviceTokenId: 'device-token-1',
      appSurface: 'teacher',
      revoked: true,
    }),
  } as unknown as jest.Mocked<AppDeviceTokenService>;
}

function contextFixture(): TeacherAppContext {
  return {
    teacherUserId: 'teacher-user-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: [],
  };
}

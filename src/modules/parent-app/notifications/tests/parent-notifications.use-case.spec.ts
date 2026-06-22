import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { AppDeviceTokenSurface } from '@prisma/client';
import { AppDeviceTokenService } from '../../../app-device-tokens/application/app-device-token.service';
import {
  RegisterAppDeviceTokenDto,
  UnregisterAppDeviceTokenDto,
} from '../../../app-device-tokens/dto/app-device-token.dto';
import { CommunicationAppNotificationCenterService } from '../../../communication/application/communication-app-notification-center.service';
import { CommunicationNotificationPreferenceService } from '../../../communication/application/communication-notification-preference.service';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppContext } from '../../shared/parent-app.types';
import {
  ArchiveParentNotificationUseCase,
  GetParentNotificationPreferencesUseCase,
  GetParentNotificationUseCase,
  GetParentNotificationsSummaryUseCase,
  ListParentNotificationsUseCase,
  MarkAllParentNotificationsReadUseCase,
  MarkParentNotificationReadUseCase,
  RegisterParentDeviceTokenUseCase,
  UnregisterParentDeviceTokenUseCase,
  UpdateParentNotificationPreferencesUseCase,
} from '../application/parent-notifications.use-cases';
import {
  ListParentNotificationsQueryDto,
  UpdateParentNotificationPreferencesDto,
} from '../dto/parent-notifications.dto';

describe('Parent notifications use cases', () => {
  it('rejects non-parent actors through ParentAppAccessService', async () => {
    const { listUseCase, accessService, notificationCenter } = createUseCases();
    accessService.assertCurrentParent.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(notificationCenter.listForActor).not.toHaveBeenCalled();
  });

  it('delegates list/detail/read/read-all/archive for the current parent only', async () => {
    const {
      listUseCase,
      getUseCase,
      summaryUseCase,
      markReadUseCase,
      markAllReadUseCase,
      archiveUseCase,
      notificationCenter,
    } = createUseCasesWithValidAccess();

    const query = {
      status: 'unread',
      createdFrom: '2026-06-21T00:00:00.000Z',
      createdTo: '2026-06-22T00:00:00.000Z',
      unreadOnly: 'true',
      category: 'announcement',
      sourceModule: 'announcements',
      groupBy: 'category',
      limit: 10,
    };

    await listUseCase.execute(query);
    await summaryUseCase.execute();
    await getUseCase.execute('notification-1');
    await markReadUseCase.execute('notification-1');
    await markAllReadUseCase.execute();
    await archiveUseCase.execute('notification-1');

    expect(notificationCenter.listForActor).toHaveBeenCalledWith({
      recipientUserId: 'parent-user-1',
      query,
      aliasStyle: 'dual',
    });
    expect(notificationCenter.summaryForActor).toHaveBeenCalledWith({
      recipientUserId: 'parent-user-1',
      aliasStyle: 'dual',
    });
    expect(notificationCenter.getForActor).toHaveBeenCalledWith({
      recipientUserId: 'parent-user-1',
      notificationId: 'notification-1',
      aliasStyle: 'dual',
    });
    expect(notificationCenter.markReadForActor).toHaveBeenCalledWith({
      recipientUserId: 'parent-user-1',
      notificationId: 'notification-1',
      aliasStyle: 'dual',
    });
    expect(notificationCenter.markAllReadForActor).toHaveBeenCalledWith({
      recipientUserId: 'parent-user-1',
      aliasStyle: 'dual',
    });
    expect(notificationCenter.archiveForActor).toHaveBeenCalledWith({
      recipientUserId: 'parent-user-1',
      notificationId: 'notification-1',
      aliasStyle: 'dual',
    });
  });

  it('delegates preferences get/update for the current parent only', async () => {
    const {
      getPreferencesUseCase,
      updatePreferencesUseCase,
      preferenceService,
    } = createUseCasesWithValidAccess();

    await getPreferencesUseCase.execute();
    await updatePreferencesUseCase.execute({
      preferences: [
        { category: 'message_received', inAppEnabled: false },
        { category: 'announcement', in_app_enabled: true },
      ],
    });

    expect(preferenceService.getPreferencesForActor).toHaveBeenCalledWith({
      schoolId: 'school-1',
      userId: 'parent-user-1',
      aliasStyle: 'dual',
    });
    expect(preferenceService.updatePreferencesForActor).toHaveBeenCalledWith({
      schoolId: 'school-1',
      userId: 'parent-user-1',
      aliasStyle: 'dual',
      preferences: [
        { category: 'message_received', inAppEnabled: false },
        { category: 'announcement', in_app_enabled: true },
      ],
    });
  });

  it('registers and unregisters device tokens for the current parent only', async () => {
    const {
      registerDeviceTokenUseCase,
      unregisterDeviceTokenUseCase,
      deviceTokenService,
    } = createUseCasesWithValidAccess();
    const registerDto: RegisterAppDeviceTokenDto = {
      token: 'fcm-token-value-for-parent-device',
      platform: 'android',
      deviceId: 'parent-device',
    };
    const unregisterDto: UnregisterAppDeviceTokenDto = {
      token: 'fcm-token-value-for-parent-device',
      deviceId: 'parent-device',
    };

    await registerDeviceTokenUseCase.execute(registerDto);
    await unregisterDeviceTokenUseCase.execute(unregisterDto);

    expect(deviceTokenService.registerForActor).toHaveBeenCalledWith({
      schoolId: 'school-1',
      userId: 'parent-user-1',
      appSurface: AppDeviceTokenSurface.PARENT,
      body: registerDto,
      aliasStyle: 'dual',
    });
    expect(deviceTokenService.unregisterForActor).toHaveBeenCalledWith({
      schoolId: 'school-1',
      userId: 'parent-user-1',
      appSurface: AppDeviceTokenSurface.PARENT,
      body: unregisterDto,
      aliasStyle: 'dual',
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
      metatype: ListParentNotificationsQueryDto,
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
      metatype: ListParentNotificationsQueryDto,
      data: '',
    };

    await expect(
      pipe.transform(
        {
          createdFrom: '2026-06-21T00:00:00.000Z',
          createdTo: '2026-06-22T00:00:00.000Z',
          unreadOnly: 'TRUE',
          category: 'ANNOUNCEMENT',
          sourceModule: 'communication',
          groupBy: 'sourceModule',
        },
        metadata,
      ),
    ).resolves.toMatchObject({
      createdFrom: '2026-06-21T00:00:00.000Z',
      createdTo: '2026-06-22T00:00:00.000Z',
      unreadOnly: 'true',
      category: 'announcement',
      sourceModule: 'communication',
      groupBy: 'sourceModule',
    });
    await expect(
      pipe.transform(
        {
          category: 'attendance',
          groupBy: 'recipientUserId',
        },
        metadata,
      ),
    ).rejects.toBeDefined();
    await expect(
      pipe.transform(
        {
          createdFrom: 'not-a-date',
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
      metatype: UpdateParentNotificationPreferencesDto,
      data: '',
    };

    await expect(
      pipe.transform(
        {
          userId: 'other-user-1',
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
  listUseCase: ListParentNotificationsUseCase;
  getUseCase: GetParentNotificationUseCase;
  summaryUseCase: GetParentNotificationsSummaryUseCase;
  markReadUseCase: MarkParentNotificationReadUseCase;
  markAllReadUseCase: MarkAllParentNotificationsReadUseCase;
  archiveUseCase: ArchiveParentNotificationUseCase;
  getPreferencesUseCase: GetParentNotificationPreferencesUseCase;
  updatePreferencesUseCase: UpdateParentNotificationPreferencesUseCase;
  registerDeviceTokenUseCase: RegisterParentDeviceTokenUseCase;
  unregisterDeviceTokenUseCase: UnregisterParentDeviceTokenUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  notificationCenter: jest.Mocked<CommunicationAppNotificationCenterService>;
  preferenceService: jest.Mocked<CommunicationNotificationPreferenceService>;
  deviceTokenService: jest.Mocked<AppDeviceTokenService>;
} {
  const accessService = {
    assertCurrentParent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const notificationCenter = notificationCenterMock();
  const preferenceService = preferenceServiceMock();
  const deviceTokenService = deviceTokenServiceMock();

  return {
    listUseCase: new ListParentNotificationsUseCase(
      accessService,
      notificationCenter,
    ),
    getUseCase: new GetParentNotificationUseCase(
      accessService,
      notificationCenter,
    ),
    summaryUseCase: new GetParentNotificationsSummaryUseCase(
      accessService,
      notificationCenter,
    ),
    markReadUseCase: new MarkParentNotificationReadUseCase(
      accessService,
      notificationCenter,
    ),
    markAllReadUseCase: new MarkAllParentNotificationsReadUseCase(
      accessService,
      notificationCenter,
    ),
    archiveUseCase: new ArchiveParentNotificationUseCase(
      accessService,
      notificationCenter,
    ),
    getPreferencesUseCase: new GetParentNotificationPreferencesUseCase(
      accessService,
      preferenceService,
    ),
    updatePreferencesUseCase: new UpdateParentNotificationPreferencesUseCase(
      accessService,
      preferenceService,
    ),
    registerDeviceTokenUseCase: new RegisterParentDeviceTokenUseCase(
      accessService,
      deviceTokenService,
    ),
    unregisterDeviceTokenUseCase: new UnregisterParentDeviceTokenUseCase(
      accessService,
      deviceTokenService,
    ),
    accessService,
    notificationCenter,
    preferenceService,
    deviceTokenService,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.assertCurrentParent.mockResolvedValue(contextFixture());
  return created;
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
      device_token_id: 'device-token-1',
      platform: 'android',
      appSurface: 'parent',
      app_surface: 'parent',
      isActive: true,
      is_active: true,
    }),
    unregisterForActor: jest.fn().mockResolvedValue({
      deviceTokenId: 'device-token-1',
      device_token_id: 'device-token-1',
      appSurface: 'parent',
      app_surface: 'parent',
      revoked: true,
    }),
  } as unknown as jest.Mocked<AppDeviceTokenService>;
}

function contextFixture(): ParentAppContext {
  return {
    parentUserId: 'parent-user-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: [],
    guardianIds: ['guardian-1'],
    children: [],
  };
}

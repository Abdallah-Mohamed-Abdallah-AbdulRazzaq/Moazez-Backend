import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CommunicationAppNotificationCenterService } from '../../../communication/application/communication-app-notification-center.service';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppContext } from '../../shared/parent-app.types';
import {
  ArchiveParentNotificationUseCase,
  GetParentNotificationUseCase,
  GetParentNotificationsSummaryUseCase,
  ListParentNotificationsUseCase,
  MarkAllParentNotificationsReadUseCase,
  MarkParentNotificationReadUseCase,
} from '../application/parent-notifications.use-cases';
import { ListParentNotificationsQueryDto } from '../dto/parent-notifications.dto';

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

    await listUseCase.execute({ status: 'unread', limit: 10 });
    await summaryUseCase.execute();
    await getUseCase.execute('notification-1');
    await markReadUseCase.execute('notification-1');
    await markAllReadUseCase.execute();
    await archiveUseCase.execute('notification-1');

    expect(notificationCenter.listForActor).toHaveBeenCalledWith({
      recipientUserId: 'parent-user-1',
      query: { status: 'unread', limit: 10 },
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
});

function createUseCases(): {
  listUseCase: ListParentNotificationsUseCase;
  getUseCase: GetParentNotificationUseCase;
  summaryUseCase: GetParentNotificationsSummaryUseCase;
  markReadUseCase: MarkParentNotificationReadUseCase;
  markAllReadUseCase: MarkAllParentNotificationsReadUseCase;
  archiveUseCase: ArchiveParentNotificationUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  notificationCenter: jest.Mocked<CommunicationAppNotificationCenterService>;
} {
  const accessService = {
    assertCurrentParent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const notificationCenter = notificationCenterMock();

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
    accessService,
    notificationCenter,
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

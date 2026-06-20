import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CommunicationAppNotificationCenterService } from '../../../communication/application/communication-app-notification-center.service';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppContext } from '../../shared/teacher-app-context';
import { TeacherAppRequiredTeacherException } from '../../shared/teacher-app.errors';
import {
  ArchiveTeacherNotificationUseCase,
  GetTeacherNotificationUseCase,
  GetTeacherNotificationsSummaryUseCase,
  ListTeacherNotificationsUseCase,
  MarkAllTeacherNotificationsReadUseCase,
  MarkTeacherNotificationReadUseCase,
} from '../application/teacher-notifications.use-cases';
import { ListTeacherNotificationsQueryDto } from '../dto/teacher-notifications.dto';

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

    await listUseCase.execute({ sourceModule: 'communication', limit: 10 });
    await summaryUseCase.execute();
    await getUseCase.execute('notification-1');
    await markReadUseCase.execute('notification-1');
    await markAllReadUseCase.execute();
    await archiveUseCase.execute('notification-1');

    expect(notificationCenter.listForActor).toHaveBeenCalledWith({
      recipientUserId: 'teacher-user-1',
      query: { sourceModule: 'communication', limit: 10 },
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
});

function createUseCases(): {
  listUseCase: ListTeacherNotificationsUseCase;
  getUseCase: GetTeacherNotificationUseCase;
  summaryUseCase: GetTeacherNotificationsSummaryUseCase;
  markReadUseCase: MarkTeacherNotificationReadUseCase;
  markAllReadUseCase: MarkAllTeacherNotificationsReadUseCase;
  archiveUseCase: ArchiveTeacherNotificationUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  notificationCenter: jest.Mocked<CommunicationAppNotificationCenterService>;
} {
  const accessService = {
    assertCurrentTeacher: jest.fn(() => contextFixture()),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const notificationCenter = notificationCenterMock();

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
    accessService,
    notificationCenter,
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

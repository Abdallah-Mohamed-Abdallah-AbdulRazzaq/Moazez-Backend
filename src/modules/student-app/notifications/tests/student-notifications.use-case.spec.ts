import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CommunicationAppNotificationCenterService } from '../../../communication/application/communication-app-notification-center.service';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type { StudentAppContext } from '../../shared/student-app.types';
import {
  ArchiveStudentNotificationUseCase,
  GetStudentNotificationUseCase,
  GetStudentNotificationsSummaryUseCase,
  ListStudentNotificationsUseCase,
  MarkAllStudentNotificationsReadUseCase,
  MarkStudentNotificationReadUseCase,
} from '../application/student-notifications.use-cases';
import { ListStudentNotificationsQueryDto } from '../dto/student-notifications.dto';

describe('Student notifications use cases', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { listUseCase, accessService, notificationCenter } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(notificationCenter.listForActor).not.toHaveBeenCalled();
  });

  it('delegates list/detail/read/read-all/archive for the current student only', async () => {
    const {
      listUseCase,
      getUseCase,
      summaryUseCase,
      markReadUseCase,
      markAllReadUseCase,
      archiveUseCase,
      notificationCenter,
    } = createUseCasesWithValidAccess();

    await listUseCase.execute({ type: 'announcement_published', page: 2 });
    await summaryUseCase.execute();
    await getUseCase.execute('notification-1');
    await markReadUseCase.execute('notification-1');
    await markAllReadUseCase.execute();
    await archiveUseCase.execute('notification-1');

    expect(notificationCenter.listForActor).toHaveBeenCalledWith({
      recipientUserId: 'student-user-1',
      query: { type: 'announcement_published', page: 2 },
      aliasStyle: 'dual',
    });
    expect(notificationCenter.summaryForActor).toHaveBeenCalledWith({
      recipientUserId: 'student-user-1',
      aliasStyle: 'dual',
    });
    expect(notificationCenter.getForActor).toHaveBeenCalledWith({
      recipientUserId: 'student-user-1',
      notificationId: 'notification-1',
      aliasStyle: 'dual',
    });
    expect(notificationCenter.markReadForActor).toHaveBeenCalledWith({
      recipientUserId: 'student-user-1',
      notificationId: 'notification-1',
      aliasStyle: 'dual',
    });
    expect(notificationCenter.markAllReadForActor).toHaveBeenCalledWith({
      recipientUserId: 'student-user-1',
      aliasStyle: 'dual',
    });
    expect(notificationCenter.archiveForActor).toHaveBeenCalledWith({
      recipientUserId: 'student-user-1',
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
      metatype: ListStudentNotificationsQueryDto,
      data: '',
    };

    await expect(
      pipe.transform(
        {
          priority: 'urgent',
          recipientUserId: 'other-user-1',
        },
        metadata,
      ),
    ).rejects.toBeDefined();
  });
});

function createUseCases(): {
  listUseCase: ListStudentNotificationsUseCase;
  getUseCase: GetStudentNotificationUseCase;
  summaryUseCase: GetStudentNotificationsSummaryUseCase;
  markReadUseCase: MarkStudentNotificationReadUseCase;
  markAllReadUseCase: MarkAllStudentNotificationsReadUseCase;
  archiveUseCase: ArchiveStudentNotificationUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  notificationCenter: jest.Mocked<CommunicationAppNotificationCenterService>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const notificationCenter = notificationCenterMock();

  return {
    listUseCase: new ListStudentNotificationsUseCase(
      accessService,
      notificationCenter,
    ),
    getUseCase: new GetStudentNotificationUseCase(
      accessService,
      notificationCenter,
    ),
    summaryUseCase: new GetStudentNotificationsSummaryUseCase(
      accessService,
      notificationCenter,
    ),
    markReadUseCase: new MarkStudentNotificationReadUseCase(
      accessService,
      notificationCenter,
    ),
    markAllReadUseCase: new MarkAllStudentNotificationsReadUseCase(
      accessService,
      notificationCenter,
    ),
    archiveUseCase: new ArchiveStudentNotificationUseCase(
      accessService,
      notificationCenter,
    ),
    accessService,
    notificationCenter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.getCurrentStudentWithEnrollment.mockResolvedValue({
    context: contextFixture(),
  } as any);
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

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: [],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

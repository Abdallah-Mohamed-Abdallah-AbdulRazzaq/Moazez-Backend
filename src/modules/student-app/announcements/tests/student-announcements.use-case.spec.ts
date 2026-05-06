import {
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import { GetStudentAnnouncementUseCase } from '../application/get-student-announcement.use-case';
import { ListStudentAnnouncementsUseCase } from '../application/list-student-announcements.use-case';
import { MarkStudentAnnouncementReadUseCase } from '../application/mark-student-announcement-read.use-case';
import { StudentAnnouncementsReadAdapter } from '../infrastructure/student-announcements-read.adapter';

describe('Student Announcements use-cases', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readAdapter.listAnnouncements).not.toHaveBeenCalled();
  });

  it('returns safe 404 for out-of-audience announcement detail', async () => {
    const { getUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findAnnouncement.mockResolvedValue(null);

    await expect(getUseCase.execute('announcement-1')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('marks only the current student user as read through the adapter', async () => {
    const { readUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.markAnnouncementRead.mockResolvedValue({
      announcementId: 'announcement-1',
      readAt: '2026-01-01T08:00:00.000Z',
    });

    await readUseCase.execute('announcement-1');

    expect(readAdapter.markAnnouncementRead).toHaveBeenCalledWith({
      context: contextFixture(),
      announcementId: 'announcement-1',
    });
  });
});

function createUseCases(): {
  listUseCase: ListStudentAnnouncementsUseCase;
  getUseCase: GetStudentAnnouncementUseCase;
  readUseCase: MarkStudentAnnouncementReadUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentAnnouncementsReadAdapter>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    listAnnouncements: jest.fn(),
    findAnnouncement: jest.fn(),
    markAnnouncementRead: jest.fn(),
  } as unknown as jest.Mocked<StudentAnnouncementsReadAdapter>;

  return {
    listUseCase: new ListStudentAnnouncementsUseCase(
      accessService,
      readAdapter,
    ),
    getUseCase: new GetStudentAnnouncementUseCase(accessService, readAdapter),
    readUseCase: new MarkStudentAnnouncementReadUseCase(
      accessService,
      readAdapter,
    ),
    accessService,
    readAdapter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
    currentStudentFixture(),
  );
  return created;
}

function currentStudentFixture(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: contextFixture(),
    student: {
      id: 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      userId: 'student-user-1',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
      user: {
        id: 'student-user-1',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    },
    enrollment: {
      id: 'enrollment-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
    },
  };
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

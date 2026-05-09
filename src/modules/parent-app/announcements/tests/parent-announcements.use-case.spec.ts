import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppContext } from '../../shared/parent-app.types';
import { GetParentAnnouncementUseCase } from '../application/get-parent-announcement.use-case';
import { ListParentAnnouncementAttachmentsUseCase } from '../application/list-parent-announcement-attachments.use-case';
import { ListParentAnnouncementsUseCase } from '../application/list-parent-announcements.use-case';
import { MarkParentAnnouncementReadUseCase } from '../application/mark-parent-announcement-read.use-case';
import {
  ParentAnnouncementsReadAdapter,
  type ParentAnnouncementsListReadModel,
} from '../infrastructure/parent-announcements-read.adapter';

describe('Parent Announcements use-cases', () => {
  it('rejects non-parent actors through ParentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.assertCurrentParent.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(readAdapter.listAnnouncements).not.toHaveBeenCalled();
  });

  it('lists announcements after resolving parent current-school children and guardians', async () => {
    const { listUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listAnnouncements.mockResolvedValue(listFixture());

    await listUseCase.execute({ search: 'exam' });

    expect(readAdapter.listAnnouncements).toHaveBeenCalledWith({
      context: contextFixture(),
      query: { search: 'exam' },
    });
  });

  it('returns safe 404 for out-of-audience announcements', async () => {
    const { getUseCase, markReadUseCase, attachmentsUseCase, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.findAnnouncement.mockResolvedValue(null);
    readAdapter.markAnnouncementRead.mockResolvedValue(null);
    readAdapter.listAttachments.mockResolvedValue(null);

    await expect(getUseCase.execute('announcement-1')).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      markReadUseCase.execute('announcement-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      attachmentsUseCase.execute('announcement-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('marks only the current parent user read through the parent adapter', async () => {
    const { markReadUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.markAnnouncementRead.mockResolvedValue({
      announcementId: 'announcement-1',
      readAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await markReadUseCase.execute('announcement-1');

    expect(readAdapter.markAnnouncementRead).toHaveBeenCalledWith({
      context: contextFixture(),
      announcementId: 'announcement-1',
    });
    expect(result.readAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

function createUseCases(): {
  listUseCase: ListParentAnnouncementsUseCase;
  getUseCase: GetParentAnnouncementUseCase;
  markReadUseCase: MarkParentAnnouncementReadUseCase;
  attachmentsUseCase: ListParentAnnouncementAttachmentsUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentAnnouncementsReadAdapter>;
} {
  const accessService = {
    assertCurrentParent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    listAnnouncements: jest.fn(),
    findAnnouncement: jest.fn(),
    markAnnouncementRead: jest.fn(),
    listAttachments: jest.fn(),
  } as unknown as jest.Mocked<ParentAnnouncementsReadAdapter>;

  return {
    listUseCase: new ListParentAnnouncementsUseCase(accessService, readAdapter),
    getUseCase: new GetParentAnnouncementUseCase(accessService, readAdapter),
    markReadUseCase: new MarkParentAnnouncementReadUseCase(
      accessService,
      readAdapter,
    ),
    attachmentsUseCase: new ListParentAnnouncementAttachmentsUseCase(
      accessService,
      readAdapter,
    ),
    accessService,
    readAdapter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.assertCurrentParent.mockResolvedValue(contextFixture());
  return created;
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
    children: [
      {
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        classroomId: 'classroom-1',
        academicYearId: 'year-1',
        termId: 'term-1',
      },
    ],
  };
}

function listFixture(): ParentAnnouncementsListReadModel {
  return {
    items: [],
    total: 0,
    page: 1,
    limit: 20,
  };
}

import {
  AuditOutcome,
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
  FileVisibility,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  RequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import {
  ArchiveCommunicationAnnouncementUseCase,
  CancelCommunicationAnnouncementUseCase,
  CreateCommunicationAnnouncementUseCase,
  DeleteCommunicationAnnouncementAttachmentUseCase,
  GetCommunicationAnnouncementReadSummaryUseCase,
  LinkCommunicationAnnouncementAttachmentUseCase,
  MarkCommunicationAnnouncementReadUseCase,
  PublishCommunicationAnnouncementUseCase,
  UpdateCommunicationAnnouncementUseCase,
} from '../application/communication-announcement.use-cases';
import { CommunicationNotificationQueueService } from '../application/communication-notification-queue.service';
import { CommunicationAnnouncementStateException } from '../domain/communication-announcement-domain';
import {
  CommunicationAnnouncementAttachmentRecord,
  CommunicationAnnouncementAuditInput,
  CommunicationAnnouncementDetailRecord,
  CommunicationAnnouncementFileReference,
  CommunicationAnnouncementReadRecord,
  CommunicationAnnouncementRepository,
} from '../infrastructure/communication-announcement.repository';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'actor-1';
const ANNOUNCEMENT_ID = 'announcement-1';
const ATTACHMENT_ID = 'attachment-1';
const FILE_ID = 'file-1';
const GRADE_ID = '11111111-1111-4111-8111-111111111111';

describe('communication announcement use cases', () => {
  it('create validates audience targets, audits mutation, and avoids out-of-scope side effects', async () => {
    let audit: CommunicationAnnouncementAuditInput | undefined;
    const repository = repositoryMock({
      createCurrentSchoolAnnouncement: jest.fn().mockImplementation((input) => {
        const created = announcementRecord({
          title: 'Grade announcement',
          body: 'Body',
          priority: CommunicationAnnouncementPriority.HIGH,
          audienceType: CommunicationAnnouncementAudienceType.GRADE,
          audiences: [audienceRecord()],
        });
        audit = input.buildAuditEntry(created);
        return Promise.resolve(created);
      }),
    });

    const result = await withScope(() =>
      new CreateCommunicationAnnouncementUseCase(repository).execute({
        title: ' Grade announcement ',
        body: ' Body ',
        status: 'draft',
        priority: 'high',
        audienceType: 'grade',
        audiences: [{ gradeId: GRADE_ID }],
        metadata: { source: 'unit' },
      }),
    );

    expect(result).toMatchObject({
      id: ANNOUNCEMENT_ID,
      title: 'Grade announcement',
      status: 'draft',
      priority: 'high',
      audienceType: 'grade',
    });
    expect(
      repository.validateAudienceTargetsInCurrentSchool,
    ).toHaveBeenCalledWith({
      audienceRows: [
        expect.objectContaining({
          audienceType: CommunicationAnnouncementAudienceType.GRADE,
          gradeId: GRADE_ID,
        }),
      ],
    });
    expect(repository.createCurrentSchoolAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        data: expect.objectContaining({
          title: 'Grade announcement',
          body: 'Body',
          status: CommunicationAnnouncementStatus.DRAFT,
          priority: CommunicationAnnouncementPriority.HIGH,
          audienceType: CommunicationAnnouncementAudienceType.GRADE,
          createdById: ACTOR_ID,
        }),
      }),
    );
    expect(audit).toMatchObject({
      actorId: ACTOR_ID,
      userType: UserType.SCHOOL_USER,
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      module: 'communication',
      action: 'communication.announcement.create',
      resourceType: 'communication_announcement',
      resourceId: ANNOUNCEMENT_ID,
      outcome: AuditOutcome.SUCCESS,
    });
    expect(repository.createNotification).not.toHaveBeenCalled();
    expect(repository.enqueueJob).not.toHaveBeenCalled();
    expect(repository.emitRealtime).not.toHaveBeenCalled();
  });

  it('update rejects published archived and cancelled announcements before persistence', async () => {
    for (const status of [
      CommunicationAnnouncementStatus.PUBLISHED,
      CommunicationAnnouncementStatus.ARCHIVED,
      CommunicationAnnouncementStatus.CANCELLED,
    ]) {
      const repository = repositoryMock({
        findCurrentSchoolAnnouncementById: jest
          .fn()
          .mockResolvedValue(announcementRecord({ status })),
      });

      await expect(
        withScope(() =>
          new UpdateCommunicationAnnouncementUseCase(repository).execute(
            ANNOUNCEMENT_ID,
            { title: 'Nope' },
          ),
        ),
      ).rejects.toBeInstanceOf(CommunicationAnnouncementStateException);
      expect(repository.updateCurrentSchoolAnnouncement).not.toHaveBeenCalled();
      expect(repository.createNotification).not.toHaveBeenCalled();
      expect(repository.enqueueJob).not.toHaveBeenCalled();
    }
  });

  it('update replaces editable fields and audits mutation', async () => {
    let audit: CommunicationAnnouncementAuditInput | undefined;
    const repository = repositoryMock({
      updateCurrentSchoolAnnouncement: jest.fn().mockImplementation((input) => {
        const updated = announcementRecord({
          title: 'Updated',
          priority: CommunicationAnnouncementPriority.URGENT,
        });
        audit = input.buildAuditEntry(updated);
        return Promise.resolve(updated);
      }),
    });

    const result = await withScope(() =>
      new UpdateCommunicationAnnouncementUseCase(repository).execute(
        ANNOUNCEMENT_ID,
        { title: 'Updated', priority: 'urgent' },
      ),
    );

    expect(result).toMatchObject({
      title: 'Updated',
      priority: 'urgent',
    });
    expect(audit).toMatchObject({
      action: 'communication.announcement.update',
      before: expect.objectContaining({ targetSchoolId: SCHOOL_ID }),
      after: expect.objectContaining({
        changedFields: ['title', 'priority', 'updatedById'],
      }),
    });
  });

  it('publish sets lifecycle fields, audits mutation, and enqueues notification generation', async () => {
    let audit: CommunicationAnnouncementAuditInput | undefined;
    const repository = repositoryMock({
      publishCurrentSchoolAnnouncement: jest
        .fn()
        .mockImplementation((input) => {
          const published = announcementRecord({
            status: CommunicationAnnouncementStatus.PUBLISHED,
            publishedAt: input.publishedAt,
            publishedById: ACTOR_ID,
          });
          audit = input.buildAuditEntry(published);
          return Promise.resolve(published);
        }),
    });
    const queueService = queueServiceMock();

    const result = await withScope(() =>
      new PublishCommunicationAnnouncementUseCase(
        repository,
        queueService,
      ).execute(ANNOUNCEMENT_ID),
    );

    expect(result).toMatchObject({
      status: 'published',
      publishedById: ACTOR_ID,
    });
    expect(repository.publishCurrentSchoolAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({
        announcementId: ANNOUNCEMENT_ID,
        actorId: ACTOR_ID,
        publishedAt: expect.any(Date),
      }),
    );
    expect(audit).toMatchObject({
      action: 'communication.announcement.publish',
      after: expect.objectContaining({
        changedFields: ['status', 'publishedAt', 'publishedById'],
      }),
    });
    expect(repository.createNotification).not.toHaveBeenCalled();
    expect(
      queueService.enqueueAnnouncementPublishedNotifications,
    ).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      announcementId: ANNOUNCEMENT_ID,
      actorUserId: ACTOR_ID,
      actorUserType: UserType.SCHOOL_USER,
    });
  });

  it('publish still returns the published announcement if enqueue fails', async () => {
    const repository = repositoryMock({
      publishCurrentSchoolAnnouncement: jest.fn().mockResolvedValue(
        announcementRecord({
          status: CommunicationAnnouncementStatus.PUBLISHED,
          publishedAt: new Date('2026-05-03T09:00:00.000Z'),
          publishedById: ACTOR_ID,
        }),
      ),
    });
    const queueService = queueServiceMock({
      enqueueAnnouncementPublishedNotifications: jest
        .fn()
        .mockRejectedValue(new Error('redis unavailable')),
    });

    const result = await withScope(() =>
      new PublishCommunicationAnnouncementUseCase(
        repository,
        queueService,
      ).execute(ANNOUNCEMENT_ID),
    );

    expect(result).toMatchObject({
      id: ANNOUNCEMENT_ID,
      status: 'published',
    });
  });

  it('archive and cancel audit lifecycle mutations', async () => {
    let archiveAudit: CommunicationAnnouncementAuditInput | undefined;
    const archiveRepository = repositoryMock({
      archiveCurrentSchoolAnnouncement: jest
        .fn()
        .mockImplementation((input) => {
          const archived = announcementRecord({
            status: CommunicationAnnouncementStatus.ARCHIVED,
            archivedAt: input.archivedAt,
            archivedById: ACTOR_ID,
          });
          archiveAudit = input.buildAuditEntry(archived);
          return Promise.resolve(archived);
        }),
    });

    await withScope(() =>
      new ArchiveCommunicationAnnouncementUseCase(archiveRepository).execute(
        ANNOUNCEMENT_ID,
      ),
    );

    expect(archiveAudit).toMatchObject({
      action: 'communication.announcement.archive',
      after: expect.objectContaining({
        changedFields: ['status', 'archivedAt', 'archivedById'],
      }),
    });

    let cancelAudit: CommunicationAnnouncementAuditInput | undefined;
    const cancelRepository = repositoryMock({
      cancelCurrentSchoolAnnouncement: jest.fn().mockImplementation((input) => {
        const cancelled = announcementRecord({
          status: CommunicationAnnouncementStatus.CANCELLED,
        });
        cancelAudit = input.buildAuditEntry(cancelled);
        return Promise.resolve(cancelled);
      }),
    });

    await withScope(() =>
      new CancelCommunicationAnnouncementUseCase(cancelRepository).execute(
        ANNOUNCEMENT_ID,
      ),
    );

    expect(cancelAudit).toMatchObject({
      action: 'communication.announcement.cancel',
      after: expect.objectContaining({ changedFields: ['status'] }),
    });
  });

  it('mark read upserts a read receipt and does not audit by default', async () => {
    const repository = repositoryMock({
      findCurrentSchoolAnnouncementById: jest.fn().mockResolvedValue(
        announcementRecord({
          status: CommunicationAnnouncementStatus.PUBLISHED,
          publishedAt: new Date('2026-05-03T08:00:00.000Z'),
        }),
      ),
      markCurrentSchoolAnnouncementRead: jest
        .fn()
        .mockResolvedValue(readRecord()),
    });

    const result = await withScope(() =>
      new MarkCommunicationAnnouncementReadUseCase(repository).execute(
        ANNOUNCEMENT_ID,
      ),
    );

    expect(result).toEqual({
      announcementId: ANNOUNCEMENT_ID,
      userId: ACTOR_ID,
      readAt: '2026-05-03T09:00:00.000Z',
    });
    expect(repository.markCurrentSchoolAnnouncementRead).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        announcementId: ANNOUNCEMENT_ID,
        userId: ACTOR_ID,
        readAt: expect.any(Date),
      }),
    );
    expect(repository.createAuditLog).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
    expect(repository.enqueueJob).not.toHaveBeenCalled();
  });

  it('read summary is compact and does not audit', async () => {
    const repository = repositoryMock({
      getCurrentSchoolAnnouncementReadSummary: jest.fn().mockResolvedValue({
        announcementId: ANNOUNCEMENT_ID,
        readCount: 2,
        totalTargetCount: null,
        totalTargetCountReason:
          'audience_target_count_deferred_until_app_audience_resolution',
      }),
    });

    const result = await withScope(() =>
      new GetCommunicationAnnouncementReadSummaryUseCase(repository).execute(
        ANNOUNCEMENT_ID,
      ),
    );
    const json = JSON.stringify(result);

    expect(result).toMatchObject({
      announcementId: ANNOUNCEMENT_ID,
      readCount: 2,
      totalTargetCount: null,
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('firstName');
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('attachment link and delete audit mutations without deleting file records', async () => {
    let linkAudit: CommunicationAnnouncementAuditInput | undefined;
    const linkRepository = repositoryMock({
      linkCurrentSchoolAnnouncementAttachment: jest
        .fn()
        .mockImplementation((input) => {
          const attachment = attachmentRecord({ caption: 'Guide' });
          linkAudit = input.buildAuditEntry(attachment, null);
          return Promise.resolve(attachment);
        }),
    });

    const linked = await withScope(() =>
      new LinkCommunicationAnnouncementAttachmentUseCase(
        linkRepository,
      ).execute(ANNOUNCEMENT_ID, { fileId: FILE_ID, caption: 'Guide' }),
    );

    expect(linked).toMatchObject({
      id: ATTACHMENT_ID,
      announcementId: ANNOUNCEMENT_ID,
      fileId: FILE_ID,
      caption: 'Guide',
    });
    expect(linkAudit).toMatchObject({
      action: 'communication.announcement_attachment.link',
      resourceType: 'communication_announcement_attachment',
      resourceId: ATTACHMENT_ID,
      after: expect.objectContaining({
        announcementId: ANNOUNCEMENT_ID,
        fileId: FILE_ID,
      }),
    });

    let deleteAudit: CommunicationAnnouncementAuditInput | undefined;
    const deleteRepository = repositoryMock({
      deleteCurrentSchoolAnnouncementAttachment: jest
        .fn()
        .mockImplementation((input) => {
          deleteAudit = input.buildAuditEntry(attachmentRecord());
          return Promise.resolve({ ok: true });
        }),
    });

    const deleted = await withScope(() =>
      new DeleteCommunicationAnnouncementAttachmentUseCase(
        deleteRepository,
      ).execute(ANNOUNCEMENT_ID, ATTACHMENT_ID),
    );

    expect(deleted).toEqual({ ok: true });
    expect(deleteAudit).toMatchObject({
      action: 'communication.announcement_attachment.delete',
      after: expect.objectContaining({
        attachmentId: ATTACHMENT_ID,
        fileId: FILE_ID,
      }),
    });
    expect(deleteRepository.deleteFile).not.toHaveBeenCalled();
    expect(deleteRepository.createNotification).not.toHaveBeenCalled();
    expect(deleteRepository.enqueueJob).not.toHaveBeenCalled();
  });
});

function repositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationAnnouncementRepository & Record<string, jest.Mock> {
  return {
    listCurrentSchoolAnnouncements: jest.fn().mockResolvedValue({
      items: [announcementRecord()],
      total: 1,
      limit: 50,
      page: 1,
    }),
    createCurrentSchoolAnnouncement: jest
      .fn()
      .mockResolvedValue(announcementRecord()),
    findCurrentSchoolAnnouncementById: jest
      .fn()
      .mockResolvedValue(announcementRecord()),
    updateCurrentSchoolAnnouncement: jest
      .fn()
      .mockResolvedValue(announcementRecord()),
    replaceCurrentSchoolAnnouncementAudience: jest.fn(),
    publishCurrentSchoolAnnouncement: jest
      .fn()
      .mockResolvedValue(announcementRecord()),
    archiveCurrentSchoolAnnouncement: jest
      .fn()
      .mockResolvedValue(announcementRecord()),
    cancelCurrentSchoolAnnouncement: jest
      .fn()
      .mockResolvedValue(announcementRecord()),
    markCurrentSchoolAnnouncementRead: jest
      .fn()
      .mockResolvedValue(readRecord()),
    getCurrentSchoolAnnouncementReadSummary: jest.fn().mockResolvedValue({
      announcementId: ANNOUNCEMENT_ID,
      readCount: 1,
      totalTargetCount: null,
      totalTargetCountReason:
        'audience_target_count_deferred_until_app_audience_resolution',
    }),
    listCurrentSchoolAnnouncementAttachments: jest.fn().mockResolvedValue({
      announcementId: ANNOUNCEMENT_ID,
      items: [attachmentRecord()],
    }),
    linkCurrentSchoolAnnouncementAttachment: jest
      .fn()
      .mockResolvedValue(attachmentRecord()),
    deleteCurrentSchoolAnnouncementAttachment: jest
      .fn()
      .mockResolvedValue({ ok: true }),
    findCurrentSchoolFileForAnnouncementAttachment: jest
      .fn()
      .mockResolvedValue(fileRecord()),
    validateAudienceTargetsInCurrentSchool: jest
      .fn()
      .mockResolvedValue({ missing: {} }),
    createAuditLog: jest.fn(),
    createNotification: jest.fn(),
    enqueueJob: jest.fn(),
    emitRealtime: jest.fn(),
    deleteFile: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as CommunicationAnnouncementRepository &
    Record<string, jest.Mock>;
}

function queueServiceMock(
  overrides?: Record<string, unknown>,
): CommunicationNotificationQueueService & Record<string, jest.Mock> {
  return {
    enqueueAnnouncementPublishedNotifications: jest.fn().mockResolvedValue({
      id: 'communication-announcement-notifications-job',
    }),
    ...(overrides ?? {}),
  } as unknown as CommunicationNotificationQueueService &
    Record<string, jest.Mock>;
}

function announcementRecord(
  overrides?: Partial<CommunicationAnnouncementDetailRecord>,
): CommunicationAnnouncementDetailRecord {
  return {
    id: ANNOUNCEMENT_ID,
    schoolId: SCHOOL_ID,
    title: 'Announcement title',
    body: 'Announcement body',
    status: CommunicationAnnouncementStatus.DRAFT,
    priority: CommunicationAnnouncementPriority.NORMAL,
    audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
    scheduledAt: null,
    publishedAt: null,
    archivedAt: null,
    expiresAt: null,
    createdById: ACTOR_ID,
    updatedById: ACTOR_ID,
    publishedById: null,
    archivedById: null,
    metadata: null,
    createdAt: new Date('2026-05-03T08:00:00.000Z'),
    updatedAt: new Date('2026-05-03T08:30:00.000Z'),
    audiences: [],
    attachments: [],
    _count: { attachments: 0, reads: 0 },
    ...(overrides ?? {}),
  };
}

function audienceRecord() {
  return {
    id: 'audience-1',
    schoolId: SCHOOL_ID,
    announcementId: ANNOUNCEMENT_ID,
    audienceType: CommunicationAnnouncementAudienceType.GRADE,
    stageId: null,
    gradeId: GRADE_ID,
    sectionId: null,
    classroomId: null,
    studentId: null,
    guardianId: null,
    userId: null,
    createdAt: new Date('2026-05-03T08:00:00.000Z'),
    updatedAt: new Date('2026-05-03T08:00:00.000Z'),
  };
}

function readRecord(
  overrides?: Partial<CommunicationAnnouncementReadRecord>,
): CommunicationAnnouncementReadRecord {
  return {
    id: 'read-1',
    schoolId: SCHOOL_ID,
    announcementId: ANNOUNCEMENT_ID,
    userId: ACTOR_ID,
    readAt: new Date('2026-05-03T09:00:00.000Z'),
    createdAt: new Date('2026-05-03T09:00:00.000Z'),
    updatedAt: new Date('2026-05-03T09:00:00.000Z'),
    ...(overrides ?? {}),
  };
}

function fileRecord(
  overrides?: Partial<CommunicationAnnouncementFileReference>,
): CommunicationAnnouncementFileReference {
  return {
    id: FILE_ID,
    schoolId: SCHOOL_ID,
    originalName: 'announcement.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048n,
    visibility: FileVisibility.PRIVATE,
    deletedAt: null,
    ...(overrides ?? {}),
  };
}

function attachmentRecord(
  overrides?: Partial<CommunicationAnnouncementAttachmentRecord>,
): CommunicationAnnouncementAttachmentRecord {
  return {
    id: ATTACHMENT_ID,
    schoolId: SCHOOL_ID,
    announcementId: ANNOUNCEMENT_ID,
    fileId: FILE_ID,
    createdById: ACTOR_ID,
    caption: null,
    sortOrder: 0,
    createdAt: new Date('2026-05-03T08:00:00.000Z'),
    updatedAt: new Date('2026-05-03T08:30:00.000Z'),
    file: fileRecord(),
    ...(overrides ?? {}),
  };
}

function withScope<T>(fn: () => T): T {
  const context: RequestContext = {
    ...createRequestContext(),
    actor: {
      id: ACTOR_ID,
      userType: UserType.SCHOOL_USER,
    },
    activeMembership: {
      membershipId: 'membership-1',
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      roleId: 'role-1',
      permissions: ['communication.announcements.manage'],
    },
  };

  return runWithRequestContext(context, fn);
}

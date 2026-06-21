import { Logger } from '@nestjs/common';
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
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  ArchiveCommunicationAnnouncementUseCase,
  CancelCommunicationAnnouncementUseCase,
  CreateCommunicationAnnouncementUseCase,
  DeleteCommunicationAnnouncementAttachmentUseCase,
  GetCommunicationAnnouncementReadSummaryUseCase,
  LinkCommunicationAnnouncementAttachmentUseCase,
  MarkCommunicationAnnouncementReadUseCase,
  PublishCommunicationAnnouncementUseCase,
  ProcessScheduledCommunicationAnnouncementsUseCase,
  ReplayCommunicationAnnouncementNotificationsUseCase,
  UpdateCommunicationAnnouncementUseCase,
} from '../application/communication-announcement.use-cases';
import { CommunicationNotificationGenerationService } from '../application/communication-notification-generation.service';
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

  it('processes due scheduled announcements through the existing publish and notification queue path', async () => {
    const now = new Date('2026-05-03T10:00:00.000Z');
    const scheduled = announcementRecord({
      status: CommunicationAnnouncementStatus.SCHEDULED,
      scheduledAt: new Date('2026-05-03T09:00:00.000Z'),
    });
    const repository = repositoryMock({
      findDueScheduledCurrentSchoolAnnouncements: jest
        .fn()
        .mockResolvedValue([scheduled]),
      findCurrentSchoolAnnouncementById: jest.fn().mockResolvedValue(scheduled),
      publishCurrentSchoolAnnouncement: jest
        .fn()
        .mockImplementation((input) =>
          Promise.resolve(
            announcementRecord({
              status: CommunicationAnnouncementStatus.PUBLISHED,
              scheduledAt: scheduled.scheduledAt,
              publishedAt: input.publishedAt,
              publishedById: ACTOR_ID,
            }),
          ),
        ),
    });
    const queueService = queueServiceMock();

    const summary = await withScope(() =>
      new ProcessScheduledCommunicationAnnouncementsUseCase(
        repository,
        new PublishCommunicationAnnouncementUseCase(repository, queueService),
      ).execute({ now, limit: 10 }),
    );

    expect(
      repository.findDueScheduledCurrentSchoolAnnouncements,
    ).toHaveBeenCalledWith({
      now,
      limit: 10,
    });
    expect(repository.publishCurrentSchoolAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({
        announcementId: ANNOUNCEMENT_ID,
        actorId: ACTOR_ID,
      }),
    );
    expect(
      queueService.enqueueAnnouncementPublishedNotifications,
    ).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      announcementId: ANNOUNCEMENT_ID,
      actorUserId: ACTOR_ID,
      actorUserType: UserType.SCHOOL_USER,
    });
    expect(summary).toEqual({
      processedCount: 1,
      publishedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });
    expect(JSON.stringify(summary)).not.toContain('schoolId');
    expect(JSON.stringify(summary)).not.toContain('recipientUserId');
  });

  it('does not publish anything when no due scheduled announcements are selected', async () => {
    const now = new Date('2026-05-03T10:00:00.000Z');
    const repository = repositoryMock({
      findDueScheduledCurrentSchoolAnnouncements: jest
        .fn()
        .mockResolvedValue([]),
    });
    const queueService = queueServiceMock();

    const summary = await withScope(() =>
      new ProcessScheduledCommunicationAnnouncementsUseCase(
        repository,
        new PublishCommunicationAnnouncementUseCase(repository, queueService),
      ).execute({ now }),
    );

    expect(
      repository.findDueScheduledCurrentSchoolAnnouncements,
    ).toHaveBeenCalledWith({
      now,
      limit: 50,
    });
    expect(repository.publishCurrentSchoolAnnouncement).not.toHaveBeenCalled();
    expect(
      queueService.enqueueAnnouncementPublishedNotifications,
    ).not.toHaveBeenCalled();
    expect(summary).toEqual({
      processedCount: 0,
      publishedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    });
  });

  it('is idempotent across repeated scheduled processing runs', async () => {
    const now = new Date('2026-05-03T10:00:00.000Z');
    const scheduled = announcementRecord({
      status: CommunicationAnnouncementStatus.SCHEDULED,
      scheduledAt: new Date('2026-05-03T09:00:00.000Z'),
    });
    const repository = repositoryMock({
      findDueScheduledCurrentSchoolAnnouncements: jest
        .fn()
        .mockResolvedValueOnce([scheduled])
        .mockResolvedValueOnce([]),
      findCurrentSchoolAnnouncementById: jest.fn().mockResolvedValue(scheduled),
      publishCurrentSchoolAnnouncement: jest
        .fn()
        .mockResolvedValue(
          announcementRecord({
            status: CommunicationAnnouncementStatus.PUBLISHED,
            publishedAt: now,
            publishedById: ACTOR_ID,
          }),
        ),
    });
    const queueService = queueServiceMock();
    const useCase = new ProcessScheduledCommunicationAnnouncementsUseCase(
      repository,
      new PublishCommunicationAnnouncementUseCase(repository, queueService),
    );

    const first = await withScope(() => useCase.execute({ now }));
    const second = await withScope(() => useCase.execute({ now }));

    expect(first).toMatchObject({ processedCount: 1, publishedCount: 1 });
    expect(second).toEqual({
      processedCount: 0,
      publishedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    });
    expect(repository.publishCurrentSchoolAnnouncement).toHaveBeenCalledTimes(
      1,
    );
    expect(
      queueService.enqueueAnnouncementPublishedNotifications,
    ).toHaveBeenCalledTimes(1);
  });

  it('continues scheduled processing after one announcement fails safely', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const firstAnnouncement = announcementRecord({
      id: 'announcement-fails',
      status: CommunicationAnnouncementStatus.SCHEDULED,
      scheduledAt: new Date('2026-05-03T09:00:00.000Z'),
    });
    const secondAnnouncement = announcementRecord({
      id: 'announcement-publishes',
      status: CommunicationAnnouncementStatus.SCHEDULED,
      scheduledAt: new Date('2026-05-03T09:05:00.000Z'),
    });
    const repository = repositoryMock({
      findDueScheduledCurrentSchoolAnnouncements: jest
        .fn()
        .mockResolvedValue([firstAnnouncement, secondAnnouncement]),
      findCurrentSchoolAnnouncementById: jest
        .fn()
        .mockResolvedValueOnce(firstAnnouncement)
        .mockResolvedValueOnce(secondAnnouncement),
      publishCurrentSchoolAnnouncement: jest
        .fn()
        .mockRejectedValueOnce(new Error('transient publish failure'))
        .mockResolvedValueOnce(
          announcementRecord({
            id: secondAnnouncement.id,
            status: CommunicationAnnouncementStatus.PUBLISHED,
            publishedAt: new Date('2026-05-03T10:00:00.000Z'),
            publishedById: ACTOR_ID,
          }),
        ),
    });
    const queueService = queueServiceMock();

    const summary = await withScope(() =>
      new ProcessScheduledCommunicationAnnouncementsUseCase(
        repository,
        new PublishCommunicationAnnouncementUseCase(repository, queueService),
      ).execute({ now: new Date('2026-05-03T10:00:00.000Z') }),
    );

    expect(summary).toEqual({
      processedCount: 2,
      publishedCount: 1,
      skippedCount: 0,
      failedCount: 1,
    });
    expect(
      queueService.enqueueAnnouncementPublishedNotifications,
    ).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('replays published announcement notifications with duplicate-safe counts', async () => {
    const repository = repositoryMock({
      findCurrentSchoolAnnouncementById: jest.fn().mockResolvedValue(
        announcementRecord({
          status: CommunicationAnnouncementStatus.PUBLISHED,
          publishedAt: new Date('2026-05-03T09:00:00.000Z'),
          publishedById: ACTOR_ID,
        }),
      ),
    });
    const generationService = notificationGenerationServiceMock({
      generateForPublishedAnnouncement: jest.fn().mockResolvedValue({
        announcementId: ANNOUNCEMENT_ID,
        recipientCount: 3,
        createdNotificationCount: 1,
        existingNotificationCount: 2,
        createdDeliveryCount: 1,
        existingDeliveryCount: 2,
        skippedReason: null,
      }),
    });

    const summary = await withScope(() =>
      new ReplayCommunicationAnnouncementNotificationsUseCase(
        repository,
        generationService,
      ).execute(ANNOUNCEMENT_ID),
    );

    expect(
      generationService.generateForPublishedAnnouncement,
    ).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      announcementId: ANNOUNCEMENT_ID,
      actorUserId: ACTOR_ID,
      actorUserType: UserType.SCHOOL_USER,
    });
    expect(summary).toEqual({
      announcementId: ANNOUNCEMENT_ID,
      replayed: true,
      generatedCount: 1,
      skippedExistingCount: 2,
      failedCount: 0,
      skippedReason: null,
    });
    const json = JSON.stringify(summary);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('recipientUserId');
    expect(json).not.toContain('delivery');
    expect(json).not.toContain('queue');
  });

  it('rejects replay for missing draft scheduled archived and expired announcements', async () => {
    await expect(
      withScope(() =>
        new ReplayCommunicationAnnouncementNotificationsUseCase(
          repositoryMock({
            findCurrentSchoolAnnouncementById: jest.fn().mockResolvedValue(null),
          }),
          notificationGenerationServiceMock(),
        ).execute(ANNOUNCEMENT_ID),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);

    for (const announcement of [
      announcementRecord({ status: CommunicationAnnouncementStatus.DRAFT }),
      announcementRecord({
        status: CommunicationAnnouncementStatus.SCHEDULED,
        scheduledAt: new Date('2026-05-03T09:00:00.000Z'),
      }),
      announcementRecord({
        status: CommunicationAnnouncementStatus.PUBLISHED,
        publishedAt: new Date('2026-05-03T09:00:00.000Z'),
        archivedAt: new Date('2026-05-03T09:30:00.000Z'),
      }),
      announcementRecord({
        status: CommunicationAnnouncementStatus.PUBLISHED,
        publishedAt: new Date('2026-05-03T09:00:00.000Z'),
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ]) {
      const generationService = notificationGenerationServiceMock();
      await expect(
        withScope(() =>
          new ReplayCommunicationAnnouncementNotificationsUseCase(
            repositoryMock({
              findCurrentSchoolAnnouncementById: jest
                .fn()
                .mockResolvedValue(announcement),
            }),
            generationService,
          ).execute(ANNOUNCEMENT_ID),
        ),
      ).rejects.toBeInstanceOf(CommunicationAnnouncementStateException);
      expect(
        generationService.generateForPublishedAnnouncement,
      ).not.toHaveBeenCalled();
    }
  });

  it('returns a safe replay summary when preferences skip all recipients', async () => {
    const generationService = notificationGenerationServiceMock({
      generateForPublishedAnnouncement: jest.fn().mockResolvedValue({
        announcementId: ANNOUNCEMENT_ID,
        recipientCount: 0,
        createdNotificationCount: 0,
        existingNotificationCount: 0,
        createdDeliveryCount: 0,
        existingDeliveryCount: 0,
        skippedReason: 'all_recipients_disabled_preferences',
      }),
    });

    const summary = await withScope(() =>
      new ReplayCommunicationAnnouncementNotificationsUseCase(
        repositoryMock({
          findCurrentSchoolAnnouncementById: jest.fn().mockResolvedValue(
            announcementRecord({
              status: CommunicationAnnouncementStatus.PUBLISHED,
              publishedAt: new Date('2026-05-03T09:00:00.000Z'),
            }),
          ),
        }),
        generationService,
      ).execute(ANNOUNCEMENT_ID),
    );

    expect(summary).toEqual({
      announcementId: ANNOUNCEMENT_ID,
      replayed: false,
      generatedCount: 0,
      skippedExistingCount: 0,
      failedCount: 0,
      skippedReason: 'all_recipients_disabled_preferences',
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
    findDueScheduledCurrentSchoolAnnouncements: jest.fn().mockResolvedValue([]),
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

function notificationGenerationServiceMock(
  overrides?: Record<string, unknown>,
): CommunicationNotificationGenerationService & Record<string, jest.Mock> {
  return {
    generateForPublishedAnnouncement: jest.fn().mockResolvedValue({
      announcementId: ANNOUNCEMENT_ID,
      recipientCount: 1,
      createdNotificationCount: 1,
      existingNotificationCount: 0,
      createdDeliveryCount: 1,
      existingDeliveryCount: 0,
      skippedReason: null,
    }),
    generateForMessageCreated: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as CommunicationNotificationGenerationService &
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

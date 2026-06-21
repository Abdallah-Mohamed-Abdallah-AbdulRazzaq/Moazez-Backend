import {
  AuditOutcome,
  CommunicationConversationStatus,
  CommunicationMessageStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  FileVisibility,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  RequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import {
  DeleteCommunicationMessageAttachmentUseCase,
  LinkCommunicationMessageAttachmentUseCase,
  ListCommunicationMessageAttachmentsUseCase,
} from '../application/communication-message-attachment.use-cases';
import { GetCommunicationMessageAttachmentDownloadUrlUseCase } from '../application/communication-message-attachment-download.use-case';
import {
  CommunicationConversationArchivedException,
  CommunicationConversationClosedException,
  CommunicationPolicyDisabledException,
} from '../domain/communication-conversation-domain';
import { CommunicationAttachmentInvalidFileException } from '../domain/communication-message-attachment-domain';
import {
  CommunicationMessageDeletedException,
  CommunicationMessageHiddenException,
} from '../domain/communication-message-domain';
import { CommunicationConversationNotMemberException } from '../domain/communication-participant-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import {
  CommunicationAttachmentAuditInput,
  CommunicationMessageAttachmentAccessRecord,
  CommunicationMessageAttachmentFileReference,
  CommunicationMessageAttachmentParticipantAccessRecord,
  CommunicationMessageAttachmentRecord,
  CommunicationMessageAttachmentRepository,
} from '../infrastructure/communication-message-attachment.repository';
import { CommunicationPolicyRepository } from '../infrastructure/communication-policy.repository';
import { CommunicationRealtimeEventsService } from '../application/communication-realtime-events.service';
import { REALTIME_SERVER_EVENTS } from '../../../infrastructure/realtime/realtime-event-names';
import { RealtimePublisherService } from '../../../infrastructure/realtime/realtime-publisher.service';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'actor-1';
const CONVERSATION_ID = 'conversation-1';
const MESSAGE_ID = 'message-1';
const FILE_ID = 'file-1';
const ATTACHMENT_ID = 'attachment-1';

describe('communication message attachment use cases', () => {
  it('lists attachments without auditing', async () => {
    const repository = repositoryMock({
      listCurrentSchoolMessageAttachments: jest.fn().mockResolvedValue({
        messageId: MESSAGE_ID,
        items: [attachmentRecord()],
      }),
    });

    const result = await withScope(() =>
      new ListCommunicationMessageAttachmentsUseCase(repository).execute(
        MESSAGE_ID,
      ),
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: ATTACHMENT_ID,
      messageId: MESSAGE_ID,
      fileId: FILE_ID,
    });
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('resolves authorized download URLs without returning storage metadata', async () => {
    const repository = repositoryMock({
      findCurrentSchoolMessageAttachmentForDownload: jest
        .fn()
        .mockResolvedValue(downloadRecord()),
    });
    const storage = storageMock();

    const result = await withScope(() =>
      new GetCommunicationMessageAttachmentDownloadUrlUseCase(
        repository,
        storage as any,
      ).execute({
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        attachmentId: ATTACHMENT_ID,
        mode: 'download',
      }),
    );

    expect(result).toBe('https://storage.example/signed-download');
    expect(storage.createDownloadUrl).toHaveBeenCalledWith({
      bucket: 'private-bucket',
      objectKey: 'objects/file-1',
      expiresInSeconds: 300,
      downloadFileName: 'worksheet.pdf',
    });
    expect(JSON.stringify({ result })).not.toContain('objectKey');
    expect(JSON.stringify({ result })).not.toContain('bucket');
  });

  it('rejects mismatched, hidden, deleted, or cross-school attachment files', async () => {
    const storage = storageMock();
    const useCase = (record: unknown) =>
      new GetCommunicationMessageAttachmentDownloadUrlUseCase(
        repositoryMock({
          findCurrentSchoolMessageAttachmentForDownload: jest
            .fn()
            .mockResolvedValue(record),
        }),
        storage as any,
      );

    await expect(
      withScope(() =>
        useCase(null).execute({
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          attachmentId: ATTACHMENT_ID,
          mode: 'download',
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });

    await expect(
      withScope(() =>
        useCase(
          downloadRecord({
            message: {
              ...downloadRecord().message,
              status: CommunicationMessageStatus.HIDDEN,
              hiddenAt: new Date('2026-05-02T08:30:00.000Z'),
            },
          }),
        ).execute({
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          attachmentId: ATTACHMENT_ID,
          mode: 'preview',
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });

    await expect(
      withScope(() =>
        useCase(
          downloadRecord({
            file: {
              ...downloadRecord().file,
              schoolId: 'other-school',
            },
          }),
        ).execute({
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          attachmentId: ATTACHMENT_ID,
          mode: 'download',
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });

    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });

  it('attachment link rejects when policy is disabled', async () => {
    const repository = repositoryMock();
    const policyRepository = policyRepositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue({
        ...buildDefaultCommunicationPolicy(),
        isEnabled: false,
      }),
    });

    await expect(
      withScope(() =>
        new LinkCommunicationMessageAttachmentUseCase(
          repository,
          policyRepository,
        ).execute(MESSAGE_ID, { fileId: FILE_ID }),
      ),
    ).rejects.toBeInstanceOf(CommunicationPolicyDisabledException);
    expect(
      repository.linkCurrentSchoolMessageAttachment,
    ).not.toHaveBeenCalled();
  });

  it('attachment link rejects when attachments are disabled or file is too large', async () => {
    await expect(
      withScope(() =>
        new LinkCommunicationMessageAttachmentUseCase(
          repositoryMock(),
          policyRepositoryMock({
            findCurrentSchoolPolicy: jest.fn().mockResolvedValue({
              ...buildDefaultCommunicationPolicy(),
              allowAttachments: false,
            }),
          }),
        ).execute(MESSAGE_ID, { fileId: FILE_ID }),
      ),
    ).rejects.toThrow('Attachments are disabled');

    await expect(
      withScope(() =>
        new LinkCommunicationMessageAttachmentUseCase(
          repositoryMock({
            findCurrentSchoolFileOrAttachmentReference: jest
              .fn()
              .mockResolvedValue(
                fileRecord({ sizeBytes: 50n * 1024n * 1024n }),
              ),
          }),
          policyRepositoryMock({
            findCurrentSchoolPolicy: jest.fn().mockResolvedValue({
              ...buildDefaultCommunicationPolicy(),
              maxAttachmentSizeMb: 1,
            }),
          }),
        ).execute(MESSAGE_ID, { fileId: FILE_ID }),
      ),
    ).rejects.toBeInstanceOf(CommunicationAttachmentInvalidFileException);
  });

  it('attachment link rejects archived closed hidden and deleted message targets', async () => {
    const repository = repositoryMock({
      findMessageForReactionOrAttachmentAccess: jest
        .fn()
        .mockResolvedValueOnce(
          messageAccessRecord({
            conversation: conversationAccess({
              status: CommunicationConversationStatus.ARCHIVED,
            }),
          }),
        )
        .mockResolvedValueOnce(
          messageAccessRecord({
            conversation: conversationAccess({
              status: CommunicationConversationStatus.CLOSED,
            }),
          }),
        )
        .mockResolvedValueOnce(
          messageAccessRecord({
            status: CommunicationMessageStatus.HIDDEN,
            hiddenAt: new Date('2026-05-02T08:30:00.000Z'),
          }),
        )
        .mockResolvedValueOnce(
          messageAccessRecord({
            status: CommunicationMessageStatus.DELETED,
            deletedAt: new Date('2026-05-02T08:30:00.000Z'),
          }),
        ),
    });
    const useCase = new LinkCommunicationMessageAttachmentUseCase(
      repository,
      policyRepositoryMock(),
    );

    await expect(
      withScope(() => useCase.execute(MESSAGE_ID, { fileId: FILE_ID })),
    ).rejects.toBeInstanceOf(CommunicationConversationArchivedException);
    await expect(
      withScope(() => useCase.execute(MESSAGE_ID, { fileId: FILE_ID })),
    ).rejects.toBeInstanceOf(CommunicationConversationClosedException);
    await expect(
      withScope(() => useCase.execute(MESSAGE_ID, { fileId: FILE_ID })),
    ).rejects.toBeInstanceOf(CommunicationMessageHiddenException);
    await expect(
      withScope(() => useCase.execute(MESSAGE_ID, { fileId: FILE_ID })),
    ).rejects.toBeInstanceOf(CommunicationMessageDeletedException);
  });

  it('attachment link rejects actors that are not active participants', async () => {
    const repository = repositoryMock({
      findActiveParticipantForActor: jest.fn().mockResolvedValue(null),
    });

    await expect(
      withScope(() =>
        new LinkCommunicationMessageAttachmentUseCase(
          repository,
          policyRepositoryMock(),
        ).execute(MESSAGE_ID, { fileId: FILE_ID }),
      ),
    ).rejects.toBeInstanceOf(CommunicationConversationNotMemberException);
  });

  it('links attachment, audits, and avoids out-of-scope side effects', async () => {
    let audit: CommunicationAttachmentAuditInput | undefined;
    const repository = repositoryMock({
      linkCurrentSchoolMessageAttachment: jest
        .fn()
        .mockImplementation((input) => {
          const next = attachmentRecord({ caption: 'worksheet' });
          audit = input.buildAuditEntry(next, null);
          return Promise.resolve(next);
        }),
    });

    const result = await withScope(() =>
      new LinkCommunicationMessageAttachmentUseCase(
        repository,
        policyRepositoryMock(),
      ).execute(MESSAGE_ID, { fileId: FILE_ID, caption: 'worksheet' }),
    );

    expect(result).toMatchObject({
      id: ATTACHMENT_ID,
      messageId: MESSAGE_ID,
      fileId: FILE_ID,
      caption: 'worksheet',
    });
    expect(repository.linkCurrentSchoolMessageAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        fileId: FILE_ID,
        uploadedById: ACTOR_ID,
      }),
    );
    expect(audit).toMatchObject({
      actorId: ACTOR_ID,
      userType: UserType.SCHOOL_USER,
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      module: 'communication',
      action: 'communication.message_attachment.link',
      resourceType: 'communication_message_attachment',
      resourceId: ATTACHMENT_ID,
      outcome: AuditOutcome.SUCCESS,
    });
    expect(repository.createReport).not.toHaveBeenCalled();
    expect(repository.createModerationAction).not.toHaveBeenCalled();
    expect(repository.createUserBlock).not.toHaveBeenCalled();
    expect(repository.createUserRestriction).not.toHaveBeenCalled();
    expect(repository.createAnnouncement).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
    expect(repository.enqueueJob).not.toHaveBeenCalled();
    expect(repository.emitRealtime).not.toHaveBeenCalled();
  });

  it('link publishes attachment.linked after persistence succeeds', async () => {
    const repository = repositoryMock({
      linkCurrentSchoolMessageAttachment: jest
        .fn()
        .mockResolvedValue(attachmentRecord({ caption: 'worksheet' })),
    });
    const publisher = realtimePublisherMock();

    await withScope(() =>
      new LinkCommunicationMessageAttachmentUseCase(
        repository,
        policyRepositoryMock(),
        new CommunicationRealtimeEventsService(publisher),
      ).execute(MESSAGE_ID, { fileId: FILE_ID, caption: 'worksheet' }),
    );

    expect(publisher.publishToConversation).toHaveBeenCalledWith(
      SCHOOL_ID,
      CONVERSATION_ID,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_ATTACHMENT_LINKED,
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        attachment: expect.objectContaining({
          attachmentId: ATTACHMENT_ID,
          fileId: FILE_ID,
          displayName: 'worksheet.pdf',
          mimeType: 'application/pdf',
          mediaKind: 'file',
          caption: 'worksheet',
          downloadPath: '/api/v1/files/file-1/download',
        }),
        eventAt: expect.any(String),
      }),
    );
    const payload = publisher.publishToConversation.mock.calls[0][3];
    const json = JSON.stringify(payload);
    for (const forbidden of [
      'uploadedById',
      'createdById',
      'ownerId',
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'bucket',
      'objectKey',
      'storageKey',
      'signedUrl',
      'metadata',
      'providerMetadata',
      'virusScan',
      'deletedAt',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('deletes attachment link and audits mutation', async () => {
    let audit: CommunicationAttachmentAuditInput | undefined;
    const repository = repositoryMock({
      deleteCurrentSchoolMessageAttachment: jest
        .fn()
        .mockImplementation((input) => {
          audit = input.buildAuditEntry(attachmentRecord());
          return Promise.resolve({ ok: true });
        }),
    });

    const result = await withScope(() =>
      new DeleteCommunicationMessageAttachmentUseCase(
        repository,
        policyRepositoryMock(),
      ).execute(MESSAGE_ID, ATTACHMENT_ID),
    );

    expect(result).toEqual({ ok: true });
    expect(audit).toMatchObject({
      action: 'communication.message_attachment.delete',
      after: expect.objectContaining({
        changedFields: ['deletedAt'],
        attachmentId: ATTACHMENT_ID,
        fileId: FILE_ID,
      }),
    });
  });

  it('delete publishes attachment.deleted after persistence succeeds', async () => {
    const repository = repositoryMock({
      findCurrentSchoolMessageAttachment: jest
        .fn()
        .mockResolvedValue(attachmentRecord()),
      deleteCurrentSchoolMessageAttachment: jest
        .fn()
        .mockResolvedValue({ ok: true }),
    });
    const publisher = realtimePublisherMock();

    await withScope(() =>
      new DeleteCommunicationMessageAttachmentUseCase(
        repository,
        policyRepositoryMock(),
        new CommunicationRealtimeEventsService(publisher),
      ).execute(MESSAGE_ID, ATTACHMENT_ID),
    );

    expect(publisher.publishToConversation).toHaveBeenCalledWith(
      SCHOOL_ID,
      CONVERSATION_ID,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_ATTACHMENT_DELETED,
      expect.objectContaining({
        attachmentId: ATTACHMENT_ID,
        fileId: FILE_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        eventAt: expect.any(String),
      }),
    );
  });
});

function repositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationMessageAttachmentRepository & Record<string, jest.Mock> {
  return {
    listCurrentSchoolMessageAttachments: jest.fn().mockResolvedValue({
      messageId: MESSAGE_ID,
      items: [attachmentRecord()],
    }),
    findMessageForReactionOrAttachmentAccess: jest
      .fn()
      .mockResolvedValue(messageAccessRecord()),
    findActiveParticipantForActor: jest
      .fn()
      .mockResolvedValue(participantRecord()),
    findCurrentSchoolFileOrAttachmentReference: jest
      .fn()
      .mockResolvedValue(fileRecord()),
    findCurrentSchoolMessageAttachment: jest
      .fn()
      .mockResolvedValue(attachmentRecord()),
    findCurrentSchoolMessageAttachmentForDownload: jest
      .fn()
      .mockResolvedValue(downloadRecord()),
    linkCurrentSchoolMessageAttachment: jest
      .fn()
      .mockResolvedValue(attachmentRecord()),
    deleteCurrentSchoolMessageAttachment: jest
      .fn()
      .mockResolvedValue({ ok: true }),
    createAuditLog: jest.fn(),
    createReport: jest.fn(),
    createModerationAction: jest.fn(),
    createUserBlock: jest.fn(),
    createUserRestriction: jest.fn(),
    createAnnouncement: jest.fn(),
    createNotification: jest.fn(),
    enqueueJob: jest.fn(),
    emitRealtime: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as CommunicationMessageAttachmentRepository &
    Record<string, jest.Mock>;
}

function storageMock() {
  return {
    createDownloadUrl: jest
      .fn()
      .mockResolvedValue('https://storage.example/signed-download'),
  };
}

function policyRepositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationPolicyRepository {
  return {
    findCurrentSchoolPolicy: jest
      .fn()
      .mockResolvedValue(buildDefaultCommunicationPolicy()),
    ...(overrides ?? {}),
  } as unknown as CommunicationPolicyRepository;
}

function realtimePublisherMock(): jest.Mocked<RealtimePublisherService> {
  return {
    bindServer: jest.fn(),
    publishToSchool: jest.fn().mockReturnValue(true),
    publishToUser: jest.fn().mockReturnValue(true),
    publishToConversation: jest.fn().mockReturnValue(true),
  } as unknown as jest.Mocked<RealtimePublisherService>;
}

function messageAccessRecord(
  overrides?: Partial<CommunicationMessageAttachmentAccessRecord>,
): CommunicationMessageAttachmentAccessRecord {
  return {
    id: MESSAGE_ID,
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    senderUserId: ACTOR_ID,
    status: CommunicationMessageStatus.SENT,
    hiddenAt: null,
    deletedAt: null,
    conversation: conversationAccess(),
    ...(overrides ?? {}),
  };
}

function conversationAccess(overrides?: {
  id?: string;
  schoolId?: string;
  status?: CommunicationConversationStatus;
}) {
  return {
    id: overrides?.id ?? CONVERSATION_ID,
    schoolId: overrides?.schoolId ?? SCHOOL_ID,
    status: overrides?.status ?? CommunicationConversationStatus.ACTIVE,
  };
}

function participantRecord(
  overrides?: Partial<CommunicationMessageAttachmentParticipantAccessRecord>,
): CommunicationMessageAttachmentParticipantAccessRecord {
  return {
    id: 'participant-1',
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    userId: ACTOR_ID,
    role: CommunicationParticipantRole.MEMBER,
    status: CommunicationParticipantStatus.ACTIVE,
    mutedUntil: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:00:00.000Z'),
    ...(overrides ?? {}),
  };
}

function fileRecord(
  overrides?: Partial<CommunicationMessageAttachmentFileReference>,
): CommunicationMessageAttachmentFileReference {
  return {
    id: FILE_ID,
    schoolId: SCHOOL_ID,
    originalName: 'worksheet.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024n,
    visibility: FileVisibility.PRIVATE,
    deletedAt: null,
    ...(overrides ?? {}),
  };
}

function attachmentRecord(
  overrides?: Partial<CommunicationMessageAttachmentRecord>,
): CommunicationMessageAttachmentRecord {
  return {
    id: ATTACHMENT_ID,
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    fileId: FILE_ID,
    uploadedById: ACTOR_ID,
    caption: null,
    sortOrder: 0,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:00:00.000Z'),
    deletedAt: null,
    file: fileRecord(),
    ...(overrides ?? {}),
  };
}

function downloadRecord(overrides?: Record<string, unknown>) {
  return {
    id: ATTACHMENT_ID,
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    fileId: FILE_ID,
    deletedAt: null,
    message: {
      id: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      status: CommunicationMessageStatus.SENT,
      hiddenAt: null,
      deletedAt: null,
    },
    file: {
      id: FILE_ID,
      schoolId: SCHOOL_ID,
      bucket: 'private-bucket',
      objectKey: 'objects/file-1',
      originalName: 'worksheet.pdf',
      mimeType: 'application/pdf',
      visibility: FileVisibility.PRIVATE,
      deletedAt: null,
    },
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
      permissions: ['communication.messages.attachments.manage'],
    },
  };

  return runWithRequestContext(context, fn);
}

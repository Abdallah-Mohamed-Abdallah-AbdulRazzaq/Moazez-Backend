import {
  AuditOutcome,
  CommunicationConversationStatus,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  RequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  CreateCommunicationMessageUseCase,
  DeleteCommunicationMessageUseCase,
  GetCommunicationMessageInfoUseCase,
  GetCommunicationMessageUseCase,
  GetCommunicationMessageReadersUseCase,
  GetCommunicationReadSummaryUseCase,
  ListCommunicationMessagesUseCase,
  MarkCommunicationConversationReadUseCase,
  MarkCommunicationMessageReadUseCase,
  UpdateCommunicationMessageUseCase,
} from '../application/communication-message.use-cases';
import {
  CommunicationConversationArchivedException,
  CommunicationConversationClosedException,
  CommunicationPolicyDisabledException,
} from '../domain/communication-conversation-domain';
import {
  CommunicationMessageDeletedException,
  CommunicationMessageEmptyException,
  CommunicationMessageHiddenException,
  CommunicationMessageSendForbiddenException,
  CommunicationMessageTooLongException,
} from '../domain/communication-message-domain';
import {
  CommunicationAttachmentInvalidFileException,
  CommunicationAttachmentNotAllowedException,
} from '../domain/communication-message-attachment-domain';
import { CommunicationConversationNotMemberException } from '../domain/communication-participant-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import {
  CommunicationMessageAuditInput,
  CommunicationMessageConversationAccessRecord,
  CommunicationMessageFileReference,
  CommunicationMessageParticipantAccessRecord,
  CommunicationMessageReadersResult,
  CommunicationMessageReadResult,
  CommunicationMessageRecord,
  CommunicationMessageRepository,
} from '../infrastructure/communication-message.repository';
import { CommunicationPolicyRepository } from '../infrastructure/communication-policy.repository';
import { CommunicationRealtimeEventsService } from '../application/communication-realtime-events.service';
import { REALTIME_SERVER_EVENTS } from '../../../infrastructure/realtime/realtime-event-names';
import { RealtimePublisherService } from '../../../infrastructure/realtime/realtime-publisher.service';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'actor-1';
const CONVERSATION_ID = 'conversation-1';
const MESSAGE_ID = 'message-1';

describe('communication message use cases', () => {
  it('list and get return messages and do not audit', async () => {
    const repository = repositoryMock({
      listCurrentSchoolMessages: jest.fn().mockResolvedValue({
        conversationId: CONVERSATION_ID,
        items: [messageRecord()],
        total: 1,
        limit: 50,
        page: 1,
      }),
    });

    const list = await withScope(() =>
      new ListCommunicationMessagesUseCase(repository).execute(
        CONVERSATION_ID,
        {},
      ),
    );
    const detail = await withScope(() =>
      new GetCommunicationMessageUseCase(repository).execute(MESSAGE_ID),
    );

    expect(list.items[0]).toMatchObject({ id: MESSAGE_ID, body: 'Hello' });
    expect(detail).toMatchObject({ id: MESSAGE_ID, body: 'Hello' });
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('send rejects when policy is disabled', async () => {
    const repository = repositoryMock();
    const policyRepository = policyRepositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue({
        ...buildDefaultCommunicationPolicy(),
        isEnabled: false,
      }),
    });

    await expect(
      withScope(() =>
        new CreateCommunicationMessageUseCase(
          repository,
          policyRepository,
        ).execute(CONVERSATION_ID, { body: 'Hello' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationPolicyDisabledException);
    expect(repository.createCurrentSchoolMessage).not.toHaveBeenCalled();
  });

  it('send rejects archived and closed conversations', async () => {
    const repository = repositoryMock({
      findConversationForMessageAccess: jest
        .fn()
        .mockResolvedValueOnce(
          conversationRecord({
            status: CommunicationConversationStatus.ARCHIVED,
          }),
        )
        .mockResolvedValueOnce(
          conversationRecord({
            status: CommunicationConversationStatus.CLOSED,
          }),
        ),
    });
    const useCase = new CreateCommunicationMessageUseCase(
      repository,
      policyRepositoryMock(),
    );

    await expect(
      withScope(() => useCase.execute(CONVERSATION_ID, { body: 'Hello' })),
    ).rejects.toBeInstanceOf(CommunicationConversationArchivedException);
    await expect(
      withScope(() => useCase.execute(CONVERSATION_ID, { body: 'Hello' })),
    ).rejects.toBeInstanceOf(CommunicationConversationClosedException);
  });

  it('send rejects muted and non-participant actors', async () => {
    const mutedRepository = repositoryMock({
      findActiveParticipantForActor: jest.fn().mockResolvedValue(
        participantRecord({
          status: CommunicationParticipantStatus.MUTED,
          mutedUntil: new Date('2026-05-03T08:00:00.000Z'),
        }),
      ),
    });
    await expect(
      withScope(() =>
        new CreateCommunicationMessageUseCase(
          mutedRepository,
          policyRepositoryMock(),
        ).execute(CONVERSATION_ID, { body: 'Hello' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationMessageSendForbiddenException);

    const nonParticipantRepository = repositoryMock({
      findActiveParticipantForActor: jest.fn().mockResolvedValue(null),
    });
    await expect(
      withScope(() =>
        new CreateCommunicationMessageUseCase(
          nonParticipantRepository,
          policyRepositoryMock(),
        ).execute(CONVERSATION_ID, { body: 'Hello' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationConversationNotMemberException);
  });

  it('send rejects content above policy maxMessageLength', async () => {
    const policyRepository = policyRepositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue({
        ...buildDefaultCommunicationPolicy(),
        maxMessageLength: 3,
      }),
    });

    await expect(
      withScope(() =>
        new CreateCommunicationMessageUseCase(
          repositoryMock(),
          policyRepository,
        ).execute(CONVERSATION_ID, { body: 'too long' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationMessageTooLongException);
  });

  it('send creates a text message, audits, and avoids out-of-scope side effects', async () => {
    let audit: CommunicationMessageAuditInput | undefined;
    const repository = repositoryMock({
      createCurrentSchoolMessage: jest.fn().mockImplementation((input) => {
        const created = messageRecord({
          body: 'Created message',
          clientMessageId: 'client-1',
        });
        audit = input.buildAuditEntry(created);
        return Promise.resolve(created);
      }),
    });

    const result = await withScope(() =>
      new CreateCommunicationMessageUseCase(
        repository,
        policyRepositoryMock(),
      ).execute(CONVERSATION_ID, {
        body: 'Created message',
        clientMessageId: 'client-1',
        metadata: { source: 'unit' },
      }),
    );

    expect(result).toMatchObject({
      id: MESSAGE_ID,
      type: 'text',
      status: 'sent',
      body: 'Created message',
      clientMessageId: 'client-1',
    });
    expect(repository.createCurrentSchoolMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        conversationId: CONVERSATION_ID,
        data: expect.objectContaining({
          senderUserId: ACTOR_ID,
          kind: CommunicationMessageKind.TEXT,
          status: CommunicationMessageStatus.SENT,
          body: 'Created message',
        }),
      }),
    );
    expect(audit).toMatchObject({
      actorId: ACTOR_ID,
      userType: UserType.SCHOOL_USER,
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      module: 'communication',
      action: 'communication.message.create',
      resourceType: 'communication_message',
      resourceId: MESSAGE_ID,
      outcome: AuditOutcome.SUCCESS,
    });
    expect(repository.createReaction).not.toHaveBeenCalled();
    expect(repository.createAttachment).not.toHaveBeenCalled();
    expect(repository.createReport).not.toHaveBeenCalled();
    expect(repository.createModerationAction).not.toHaveBeenCalled();
    expect(repository.createUserBlock).not.toHaveBeenCalled();
    expect(repository.createUserRestriction).not.toHaveBeenCalled();
    expect(repository.createAnnouncement).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
    expect(repository.enqueueJob).not.toHaveBeenCalled();
    expect(repository.emitRealtime).not.toHaveBeenCalled();
  });

  it('send creates an image message with validated attachment rows', async () => {
    let audit: CommunicationMessageAuditInput | undefined;
    const repository = repositoryMock({
      findCurrentSchoolFilesForMessageAttachments: jest
        .fn()
        .mockResolvedValue([fileReference({ mimeType: 'image/jpeg' })]),
      createCurrentSchoolMessage: jest.fn().mockImplementation((input) => {
        const created = messageRecord({
          kind: CommunicationMessageKind.IMAGE,
          body: 'Class photo',
          attachments: [attachmentRecord()] as any,
        });
        audit = input.buildAuditEntry(created);
        return Promise.resolve({ message: created, wasCreated: true });
      }),
    });

    const result = await withScope(() =>
      new CreateCommunicationMessageUseCase(
        repository,
        policyRepositoryMock(),
      ).execute(CONVERSATION_ID, {
        type: 'image',
        caption: 'Class photo',
        clientMessageId: 'client-image-1',
        attachments: [
          {
            fileId: 'file-1',
            mediaKind: 'image',
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      type: 'image',
      body: 'Class photo',
      attachmentsCount: 1,
      attachments: [
        expect.objectContaining({
          attachmentId: 'attachment-1',
          fileId: 'file-1',
          displayName: 'photo.jpg',
          mediaKind: 'image',
          downloadPath: '/api/v1/files/file-1/download',
        }),
      ],
    });
    expect(
      repository.findCurrentSchoolFilesForMessageAttachments,
    ).toHaveBeenCalledWith(['file-1']);
    expect(repository.createCurrentSchoolMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: CommunicationMessageKind.IMAGE,
          body: 'Class photo',
          clientMessageId: 'client-image-1',
          attachments: [
            {
              fileId: 'file-1',
              uploadedById: ACTOR_ID,
              caption: 'Class photo',
              sortOrder: 0,
            },
          ],
        }),
      }),
    );
    expect(audit?.after).toMatchObject({
      changedFields: expect.arrayContaining(['attachments']),
    });
  });

  it('send rejects media message kinds without attachments', async () => {
    const repository = repositoryMock();

    await expect(
      withScope(() =>
        new CreateCommunicationMessageUseCase(
          repository,
          policyRepositoryMock(),
        ).execute(CONVERSATION_ID, { type: 'image', caption: 'Missing file' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationMessageEmptyException);
    expect(repository.findCurrentSchoolFilesForMessageAttachments).not.toHaveBeenCalled();
    expect(repository.createCurrentSchoolMessage).not.toHaveBeenCalled();
  });

  it('send rejects media MIME mismatches before persistence', async () => {
    const repository = repositoryMock({
      findCurrentSchoolFilesForMessageAttachments: jest
        .fn()
        .mockResolvedValue([fileReference({ mimeType: 'video/mp4' })]),
    });

    await expect(
      withScope(() =>
        new CreateCommunicationMessageUseCase(
          repository,
          policyRepositoryMock(),
        ).execute(CONVERSATION_ID, {
          type: 'image',
          attachments: [{ fileId: 'file-1', mediaKind: 'image' }],
        }),
      ),
    ).rejects.toBeInstanceOf(CommunicationAttachmentInvalidFileException);
    expect(repository.createCurrentSchoolMessage).not.toHaveBeenCalled();
  });

  it('send enforces attachment, video, and voice policy switches', async () => {
    const useCaseForPolicy = (policy: ReturnType<typeof buildDefaultCommunicationPolicy>) =>
      new CreateCommunicationMessageUseCase(
        repositoryMock({
          findCurrentSchoolFilesForMessageAttachments: jest
            .fn()
            .mockResolvedValue([fileReference({ mimeType: 'video/mp4' })]),
        }),
        policyRepositoryMock({
          findCurrentSchoolPolicy: jest.fn().mockResolvedValue(policy),
        }),
      );

    await expect(
      withScope(() =>
        useCaseForPolicy({
          ...buildDefaultCommunicationPolicy(),
          allowAttachments: false,
        }).execute(CONVERSATION_ID, {
          type: 'file',
          attachments: [{ fileId: 'file-1', mediaKind: 'file' }],
        }),
      ),
    ).rejects.toBeInstanceOf(CommunicationAttachmentNotAllowedException);

    await expect(
      withScope(() =>
        useCaseForPolicy({
          ...buildDefaultCommunicationPolicy(),
          allowVideoMessages: false,
        }).execute(CONVERSATION_ID, {
          type: 'video',
          attachments: [{ fileId: 'file-1', mediaKind: 'video' }],
        }),
      ),
    ).rejects.toBeInstanceOf(CommunicationAttachmentNotAllowedException);

    await expect(
      withScope(() =>
        new CreateCommunicationMessageUseCase(
          repositoryMock({
            findCurrentSchoolFilesForMessageAttachments: jest
              .fn()
              .mockResolvedValue([fileReference({ mimeType: 'audio/mpeg' })]),
          }),
          policyRepositoryMock({
            findCurrentSchoolPolicy: jest.fn().mockResolvedValue({
              ...buildDefaultCommunicationPolicy(),
              allowVoiceMessages: false,
            }),
          }),
        ).execute(CONVERSATION_ID, {
          type: 'voice',
          attachments: [{ fileId: 'file-1', mediaKind: 'audio' }],
        }),
      ),
    ).rejects.toBeInstanceOf(CommunicationAttachmentNotAllowedException);
  });

  it('send enforces maxAttachmentSizeMb per attachment file', async () => {
    const repository = repositoryMock({
      findCurrentSchoolFilesForMessageAttachments: jest
        .fn()
        .mockResolvedValue([
          fileReference({ mimeType: 'application/pdf', sizeBytes: 2_000_000n }),
        ]),
    });
    const policyRepository = policyRepositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue({
        ...buildDefaultCommunicationPolicy(),
        maxAttachmentSizeMb: 1,
      }),
    });

    await expect(
      withScope(() =>
        new CreateCommunicationMessageUseCase(
          repository,
          policyRepository,
        ).execute(CONVERSATION_ID, {
          type: 'file',
          attachments: [{ fileId: 'file-1', mediaKind: 'file' }],
        }),
      ),
    ).rejects.toBeInstanceOf(CommunicationAttachmentInvalidFileException);
    expect(repository.createCurrentSchoolMessage).not.toHaveBeenCalled();
  });

  it('send publishes message.created after persistence succeeds', async () => {
    const repository = repositoryMock({
      createCurrentSchoolMessage: jest.fn().mockResolvedValue(
        messageRecord({
          body: 'Created message',
          clientMessageId: 'client-1',
          metadata: { source: 'unit', body: 'blocked metadata' },
        }),
      ),
    });
    const publisher = realtimePublisherMock();

    await withScope(() =>
      new CreateCommunicationMessageUseCase(
        repository,
        policyRepositoryMock(),
        new CommunicationRealtimeEventsService(publisher),
      ).execute(CONVERSATION_ID, {
        body: 'Created message',
        clientMessageId: 'client-1',
      }),
    );

    expect(publisher.publishToConversation).toHaveBeenCalledWith(
      SCHOOL_ID,
      CONVERSATION_ID,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_CREATED,
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        eventAt: expect.any(String),
        message: expect.objectContaining({
          id: MESSAGE_ID,
          body: 'Created message',
          clientMessageId: 'client-1',
          metadata: { source: 'unit' },
        }),
      }),
    );
  });

  it('send publishes media message.created with safe attachments only', async () => {
    const repository = repositoryMock({
      createCurrentSchoolMessage: jest.fn().mockResolvedValue({
        message: messageRecord({
          kind: CommunicationMessageKind.IMAGE,
          body: 'Photo',
          attachments: [
            attachmentRecord({
              file: {
                id: 'file-1',
                originalName: 'photo.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 123n,
                visibility: 'PRIVATE',
                createdAt: new Date('2026-05-02T07:59:00.000Z'),
                bucket: 'hidden',
                objectKey: 'hidden',
                signedUrl: 'hidden',
              },
              uploadedById: 'hidden',
              createdById: 'hidden',
            }),
          ] as any,
        }),
        wasCreated: true,
      }),
    });
    const publisher = realtimePublisherMock();

    await withScope(() =>
      new CreateCommunicationMessageUseCase(
        repository,
        policyRepositoryMock(),
        new CommunicationRealtimeEventsService(publisher),
      ).execute(CONVERSATION_ID, {
        type: 'image',
        attachments: [{ fileId: 'file-1', mediaKind: 'image' }],
      }),
    );

    const payload = publisher.publishToConversation.mock.calls[0][3];
    expect(payload).toMatchObject({
      message: expect.objectContaining({
        type: 'image',
        attachments: [
          expect.objectContaining({
            attachmentId: 'attachment-1',
            fileId: 'file-1',
            displayName: 'photo.jpg',
            mediaKind: 'image',
            downloadPath: '/api/v1/files/file-1/download',
          }),
        ],
        attachmentsCount: 1,
      }),
    });
    const json = JSON.stringify(payload);
    expect(json).not.toContain('bucket');
    expect(json).not.toContain('objectKey');
    expect(json).not.toContain('signedUrl');
    expect(json).not.toContain('uploadedById');
    expect(json).not.toContain('createdById');
  });

  it('send does not publish message.created for idempotent clientMessageId retry', async () => {
    const repository = repositoryMock({
      createCurrentSchoolMessage: jest.fn().mockResolvedValue({
        message: messageRecord({
          kind: CommunicationMessageKind.IMAGE,
          clientMessageId: 'client-image-1',
          attachments: [attachmentRecord()] as any,
        }),
        wasCreated: false,
      }),
    });
    const publisher = realtimePublisherMock();

    const result = await withScope(() =>
      new CreateCommunicationMessageUseCase(
        repository,
        policyRepositoryMock(),
        new CommunicationRealtimeEventsService(publisher),
      ).execute(CONVERSATION_ID, {
        type: 'image',
        clientMessageId: 'client-image-1',
        attachments: [{ fileId: 'file-1', mediaKind: 'image' }],
      }),
    );

    expect(result).toMatchObject({
      clientMessageId: 'client-image-1',
      attachmentsCount: 1,
    });
    expect(publisher.publishToConversation).not.toHaveBeenCalled();
  });

  it('does not publish message.created when persistence fails', async () => {
    const repository = repositoryMock({
      createCurrentSchoolMessage: jest
        .fn()
        .mockRejectedValue(new Error('database unavailable')),
    });
    const publisher = realtimePublisherMock();

    await expect(
      withScope(() =>
        new CreateCommunicationMessageUseCase(
          repository,
          policyRepositoryMock(),
          new CommunicationRealtimeEventsService(publisher),
        ).execute(CONVERSATION_ID, { body: 'Created message' }),
      ),
    ).rejects.toThrow('database unavailable');

    expect(publisher.publishToConversation).not.toHaveBeenCalled();
  });

  it('edit audits mutation and rejects deleted or hidden messages', async () => {
    let audit: CommunicationMessageAuditInput | undefined;
    const repository = repositoryMock({
      updateCurrentSchoolMessage: jest.fn().mockImplementation((input) => {
        const updated = messageRecord({
          body: 'Updated',
          editedAt: new Date('2026-05-02T09:00:00.000Z'),
        });
        audit = input.buildAuditEntry(updated);
        return Promise.resolve(updated);
      }),
    });

    const result = await withScope(() =>
      new UpdateCommunicationMessageUseCase(
        repository,
        policyRepositoryMock(),
      ).execute(MESSAGE_ID, { body: 'Updated' }),
    );

    expect(result).toMatchObject({
      body: 'Updated',
      editedAt: '2026-05-02T09:00:00.000Z',
    });
    expect(audit).toMatchObject({
      action: 'communication.message.update',
      before: expect.objectContaining({ targetSchoolId: SCHOOL_ID }),
      after: expect.objectContaining({
        changedFields: ['body', 'editedAt'],
      }),
    });

    await expect(
      withScope(() =>
        new UpdateCommunicationMessageUseCase(
          repositoryMock({
            findCurrentSchoolMessageById: jest.fn().mockResolvedValue(
              messageRecord({
                status: CommunicationMessageStatus.DELETED,
                deletedAt: new Date('2026-05-02T09:00:00.000Z'),
              }),
            ),
          }),
          policyRepositoryMock(),
        ).execute(MESSAGE_ID, { body: 'Nope' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationMessageDeletedException);

    await expect(
      withScope(() =>
        new UpdateCommunicationMessageUseCase(
          repositoryMock({
            findCurrentSchoolMessageById: jest.fn().mockResolvedValue(
              messageRecord({
                status: CommunicationMessageStatus.HIDDEN,
                hiddenAt: new Date('2026-05-02T09:00:00.000Z'),
              }),
            ),
          }),
          policyRepositoryMock(),
        ).execute(MESSAGE_ID, { body: 'Nope' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationMessageHiddenException);
  });

  it('edit publishes message.updated after persistence succeeds', async () => {
    const repository = repositoryMock({
      updateCurrentSchoolMessage: jest.fn().mockResolvedValue(
        messageRecord({
          body: 'Updated',
          editedAt: new Date('2026-05-02T09:00:00.000Z'),
        }),
      ),
    });
    const publisher = realtimePublisherMock();

    await withScope(() =>
      new UpdateCommunicationMessageUseCase(
        repository,
        policyRepositoryMock(),
        new CommunicationRealtimeEventsService(publisher),
      ).execute(MESSAGE_ID, { body: 'Updated' }),
    );

    expect(publisher.publishToConversation).toHaveBeenCalledWith(
      SCHOOL_ID,
      CONVERSATION_ID,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_UPDATED,
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        message: expect.objectContaining({
          id: MESSAGE_ID,
          body: 'Updated',
        }),
        eventAt: expect.any(String),
      }),
    );
  });

  it('delete hides body in response and audits mutation', async () => {
    let audit: CommunicationMessageAuditInput | undefined;
    const repository = repositoryMock({
      deleteOrHideCurrentSchoolMessage: jest
        .fn()
        .mockImplementation((input) => {
          const deleted = messageRecord({
            status: CommunicationMessageStatus.DELETED,
            deletedAt: new Date('2026-05-02T09:30:00.000Z'),
            deletedById: ACTOR_ID,
          });
          audit = input.buildAuditEntry(deleted);
          return Promise.resolve(deleted);
        }),
    });

    const result = await withScope(() =>
      new DeleteCommunicationMessageUseCase(repository).execute(MESSAGE_ID),
    );

    expect(result).toMatchObject({
      status: 'deleted',
      body: null,
      deletedAt: '2026-05-02T09:30:00.000Z',
      deletedById: ACTOR_ID,
    });
    expect(audit).toMatchObject({
      action: 'communication.message.delete',
      after: expect.objectContaining({
        changedFields: ['status', 'deletedAt', 'deletedById'],
      }),
    });
  });

  it('delete publishes message.deleted without message body', async () => {
    const repository = repositoryMock({
      deleteOrHideCurrentSchoolMessage: jest.fn().mockResolvedValue(
        messageRecord({
          status: CommunicationMessageStatus.DELETED,
          body: 'Hidden from realtime',
          deletedAt: new Date('2026-05-02T09:30:00.000Z'),
          deletedById: ACTOR_ID,
        }),
      ),
    });
    const publisher = realtimePublisherMock();

    await withScope(() =>
      new DeleteCommunicationMessageUseCase(
        repository,
        new CommunicationRealtimeEventsService(publisher),
      ).execute(MESSAGE_ID),
    );

    expect(publisher.publishToConversation).toHaveBeenCalledWith(
      SCHOOL_ID,
      CONVERSATION_ID,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_DELETED,
      {
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        status: 'deleted',
        deletedAt: '2026-05-02T09:30:00.000Z',
        hiddenAt: null,
        eventAt: expect.any(String),
      },
    );
    expect(
      JSON.stringify(publisher.publishToConversation.mock.calls),
    ).not.toContain('Hidden from realtime');
  });

  it('mark message read upserts a read row and does not audit by default', async () => {
    const repository = repositoryMock({
      markCurrentSchoolMessageRead: jest.fn().mockResolvedValue(readRecord()),
    });

    const result = await withScope(() =>
      new MarkCommunicationMessageReadUseCase(repository).execute(MESSAGE_ID),
    );

    expect(result).toMatchObject({
      messageId: MESSAGE_ID,
      userId: ACTOR_ID,
      readAt: '2026-05-02T09:00:00.000Z',
    });
    expect(repository.markCurrentSchoolMessageRead).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        userId: ACTOR_ID,
        participantId: 'participant-1',
      }),
    );
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('mark message read treats missing scoped messages as not found', async () => {
    const repository = repositoryMock({
      findCurrentSchoolMessageById: jest.fn().mockResolvedValue(null),
    });
    let error: unknown;

    try {
      await withScope(() =>
        new MarkCommunicationMessageReadUseCase(repository).execute(MESSAGE_ID),
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(NotFoundDomainException);
    expect(repository.markCurrentSchoolMessageRead).not.toHaveBeenCalled();
  });

  it('mark message read rejects actors who are not conversation participants', async () => {
    const repository = repositoryMock({
      findActiveParticipantForActor: jest.fn().mockResolvedValue(null),
    });
    let error: unknown;

    try {
      await withScope(() =>
        new MarkCommunicationMessageReadUseCase(repository).execute(MESSAGE_ID),
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(CommunicationConversationNotMemberException);
    expect(repository.markCurrentSchoolMessageRead).not.toHaveBeenCalled();
  });

  it('mark message read publishes message.read and still does not audit', async () => {
    const repository = repositoryMock({
      markCurrentSchoolMessageRead: jest.fn().mockResolvedValue(readRecord()),
    });
    const publisher = realtimePublisherMock();

    await withScope(() =>
      new MarkCommunicationMessageReadUseCase(
        repository,
        new CommunicationRealtimeEventsService(publisher),
      ).execute(MESSAGE_ID),
    );

    expect(publisher.publishToConversation).toHaveBeenCalledWith(
      SCHOOL_ID,
      CONVERSATION_ID,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_READ,
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        readerId: ACTOR_ID,
        readAt: '2026-05-02T09:00:00.000Z',
        readCount: 1,
        eventAt: expect.any(String),
      }),
    );
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('does not publish message.read when sender marks their own message read', async () => {
    const repository = repositoryMock({
      markCurrentSchoolMessageRead: jest.fn().mockResolvedValue(
        readRecord({
          id: null,
          readCount: 2,
          createdAt: null,
          updatedAt: null,
          isSenderRead: true,
        }),
      ),
    });
    const publisher = realtimePublisherMock();

    const result = await withScope(() =>
      new MarkCommunicationMessageReadUseCase(
        repository,
        new CommunicationRealtimeEventsService(publisher),
      ).execute(MESSAGE_ID),
    );

    expect(result).toMatchObject({
      id: null,
      messageId: MESSAGE_ID,
      userId: ACTOR_ID,
      readCount: 2,
      createdAt: null,
      updatedAt: null,
    });
    expect(publisher.publishToConversation).not.toHaveBeenCalled();
  });

  it('mark conversation read returns affected message counts', async () => {
    const repository = repositoryMock({
      markCurrentSchoolConversationRead: jest.fn().mockResolvedValue({
        conversationId: CONVERSATION_ID,
        readAt: new Date('2026-05-02T09:00:00.000Z'),
        markedCount: 2,
        messages: [
          { messageId: 'message-1', readCount: 1 },
          { messageId: 'message-2', readCount: 3 },
        ],
      }),
    });

    const result = await withScope(() =>
      new MarkCommunicationConversationReadUseCase(repository).execute(
        CONVERSATION_ID,
        { readAt: '2026-05-02T09:00:00.000Z' },
      ),
    );

    expect(result).toEqual({
      conversationId: CONVERSATION_ID,
      readAt: '2026-05-02T09:00:00.000Z',
      markedCount: 2,
      messages: [
        { messageId: 'message-1', readCount: 1 },
        { messageId: 'message-2', readCount: 3 },
      ],
    });
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('mark conversation read publishes markedCount and affected message counts', async () => {
    const repository = repositoryMock({
      markCurrentSchoolConversationRead: jest.fn().mockResolvedValue({
        conversationId: CONVERSATION_ID,
        readAt: new Date('2026-05-02T09:00:00.000Z'),
        markedCount: 2,
        messages: [
          { messageId: 'message-1', readCount: 1 },
          { messageId: 'message-2', readCount: 3 },
        ],
      }),
    });
    const publisher = realtimePublisherMock();

    await withScope(() =>
      new MarkCommunicationConversationReadUseCase(
        repository,
        new CommunicationRealtimeEventsService(publisher),
      ).execute(CONVERSATION_ID),
    );

    expect(publisher.publishToConversation).toHaveBeenCalledWith(
      SCHOOL_ID,
      CONVERSATION_ID,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_READ,
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        readerId: ACTOR_ID,
        readAt: '2026-05-02T09:00:00.000Z',
        markedCount: 2,
        messages: [
          { messageId: 'message-1', readCount: 1 },
          { messageId: 'message-2', readCount: 3 },
        ],
        eventAt: expect.any(String),
      }),
    );
  });

  it('read summary returns aggregate counts without user details', async () => {
    const repository = repositoryMock({
      loadCurrentSchoolConversationReadSummary: jest.fn().mockResolvedValue({
        conversationId: CONVERSATION_ID,
        items: [{ messageId: MESSAGE_ID, readCount: 3 }],
        total: 1,
        limit: 50,
        page: 1,
      }),
    });

    const result = await withScope(() =>
      new GetCommunicationReadSummaryUseCase(repository).execute(
        CONVERSATION_ID,
        {},
      ),
    );
    const json = JSON.stringify(result);

    expect(result.items).toEqual([{ messageId: MESSAGE_ID, readCount: 3 }]);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('firstName');
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('message readers returns safe cards for participants', async () => {
    const repository = repositoryMock({
      loadCurrentSchoolMessageReaders: jest
        .fn()
        .mockResolvedValue(messageReadersResult()),
    });

    const result = await withScope(() =>
      new GetCommunicationMessageReadersUseCase(repository).execute(
        MESSAGE_ID,
        { limit: 25, page: 1 },
      ),
    );

    expect(repository.loadCurrentSchoolMessageReaders).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      limit: 25,
      page: 1,
    });
    expect(result).toMatchObject({
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      readCount: 2,
      participantsCount: 3,
      fullyRead: true,
      readers: [
        {
          userId: 'reader-1',
          displayName: 'Mona Parent',
          userType: 'parent',
          isMe: false,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('message readers allows elevated viewers without participant membership', async () => {
    const repository = repositoryMock({
      findActiveParticipantForActor: jest.fn().mockResolvedValue(null),
      loadCurrentSchoolMessageReaders: jest
        .fn()
        .mockResolvedValue(messageReadersResult()),
    });

    await withScope(
      () =>
        new GetCommunicationMessageReadersUseCase(repository).execute(
          MESSAGE_ID,
          {},
        ),
      ['communication.admin.view'],
    );

    expect(repository.loadCurrentSchoolMessageReaders).toHaveBeenCalled();
  });

  it('message readers rejects non-participant actors without elevated access', async () => {
    const repository = repositoryMock({
      findActiveParticipantForActor: jest.fn().mockResolvedValue(null),
      loadCurrentSchoolMessageReaders: jest
        .fn()
        .mockResolvedValue(messageReadersResult()),
    });

    await expect(
      withScope(() =>
        new GetCommunicationMessageReadersUseCase(repository).execute(
          MESSAGE_ID,
          {},
        ),
      ),
    ).rejects.toBeInstanceOf(CommunicationConversationNotMemberException);
    expect(repository.loadCurrentSchoolMessageReaders).not.toHaveBeenCalled();
  });

  it('message info wraps the safe message preview and readers', async () => {
    const repository = repositoryMock({
      loadCurrentSchoolMessageReaders: jest
        .fn()
        .mockResolvedValue(
          messageReadersResult({
            message: {
              ...messageReadersResult().message,
              status: CommunicationMessageStatus.HIDDEN,
              hiddenAt: new Date('2026-05-02T10:00:00.000Z'),
              body: 'hidden body',
            },
          }),
        ),
    });

    const result = await withScope(() =>
      new GetCommunicationMessageInfoUseCase(repository).execute(MESSAGE_ID),
    );

    expect(result.message).toMatchObject({
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      status: 'hidden',
      body: null,
      content: null,
      readCount: 2,
    });
    expect(JSON.stringify(result)).not.toContain('hidden body');
  });
});

function repositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationMessageRepository & Record<string, jest.Mock> {
  return {
    listCurrentSchoolMessages: jest.fn().mockResolvedValue({
      conversationId: CONVERSATION_ID,
      items: [messageRecord()],
      total: 1,
      limit: 50,
      page: 1,
    }),
    findCurrentSchoolMessageById: jest.fn().mockResolvedValue(messageRecord()),
    findCurrentSchoolReplyTarget: jest.fn().mockResolvedValue(messageRecord()),
    findConversationForMessageAccess: jest
      .fn()
      .mockResolvedValue(conversationRecord()),
    findConversationForMessage: jest
      .fn()
      .mockResolvedValue(conversationRecord()),
    findActiveParticipantForActor: jest
      .fn()
      .mockResolvedValue(participantRecord()),
    findCurrentSchoolFilesForMessageAttachments: jest
      .fn()
      .mockResolvedValue([fileReference()]),
    createCurrentSchoolMessage: jest.fn().mockResolvedValue(messageRecord()),
    updateCurrentSchoolMessage: jest.fn().mockResolvedValue(messageRecord()),
    deleteOrHideCurrentSchoolMessage: jest
      .fn()
      .mockResolvedValue(messageRecord()),
    markCurrentSchoolMessageRead: jest.fn().mockResolvedValue(readRecord()),
    markCurrentSchoolConversationRead: jest.fn().mockResolvedValue({
      conversationId: CONVERSATION_ID,
      readAt: new Date('2026-05-02T09:00:00.000Z'),
      markedCount: 1,
      messages: [{ messageId: MESSAGE_ID, readCount: 1 }],
    }),
    loadCurrentSchoolConversationReadSummary: jest.fn().mockResolvedValue({
      conversationId: CONVERSATION_ID,
      items: [{ messageId: MESSAGE_ID, readCount: 1 }],
      total: 1,
      limit: 50,
      page: 1,
    }),
    loadCurrentSchoolMessageReaders: jest
      .fn()
      .mockResolvedValue(messageReadersResult()),
    createAuditLog: jest.fn(),
    createReaction: jest.fn(),
    createAttachment: jest.fn(),
    createReport: jest.fn(),
    createModerationAction: jest.fn(),
    createUserBlock: jest.fn(),
    createUserRestriction: jest.fn(),
    createAnnouncement: jest.fn(),
    createNotification: jest.fn(),
    enqueueJob: jest.fn(),
    emitRealtime: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as CommunicationMessageRepository & Record<string, jest.Mock>;
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

function conversationRecord(
  overrides?: Partial<CommunicationMessageConversationAccessRecord>,
): CommunicationMessageConversationAccessRecord {
  return {
    id: CONVERSATION_ID,
    schoolId: SCHOOL_ID,
    status: CommunicationConversationStatus.ACTIVE,
    metadata: null,
    ...(overrides ?? {}),
  };
}

function participantRecord(
  overrides?: Partial<CommunicationMessageParticipantAccessRecord>,
): CommunicationMessageParticipantAccessRecord {
  return {
    id: 'participant-1',
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    userId: ACTOR_ID,
    role: CommunicationParticipantRole.MEMBER,
    status: CommunicationParticipantStatus.ACTIVE,
    mutedUntil: null,
    lastReadMessageId: null,
    lastReadAt: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:00:00.000Z'),
    ...(overrides ?? {}),
  };
}

function messageRecord(
  overrides?: Partial<CommunicationMessageRecord>,
): CommunicationMessageRecord {
  return {
    id: MESSAGE_ID,
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    senderUserId: ACTOR_ID,
    kind: CommunicationMessageKind.TEXT,
    status: CommunicationMessageStatus.SENT,
    body: 'Hello',
    clientMessageId: null,
    replyToMessageId: null,
    editedAt: null,
    hiddenById: null,
    hiddenAt: null,
    hiddenReason: null,
    deletedById: null,
    deletedAt: null,
    sentAt: new Date('2026-05-02T08:00:00.000Z'),
    metadata: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:00:00.000Z'),
    _count: { reads: 0 },
    reads: [],
    attachments: [],
    ...(overrides ?? {}),
  };
}

function attachmentRecord(overrides?: Record<string, unknown>) {
  return {
    id: 'attachment-1',
    fileId: 'file-1',
    caption: 'Photo caption',
    sortOrder: 0,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    file: {
      id: 'file-1',
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 123n,
      visibility: 'PRIVATE',
      createdAt: new Date('2026-05-02T07:59:00.000Z'),
    },
    ...(overrides ?? {}),
  };
}

function fileReference(
  overrides?: Partial<CommunicationMessageFileReference>,
): CommunicationMessageFileReference {
  return {
    id: 'file-1',
    schoolId: SCHOOL_ID,
    originalName: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 123n,
    visibility: 'PRIVATE',
    deletedAt: null,
    ...(overrides ?? {}),
  } as CommunicationMessageFileReference;
}

function readRecord(
  overrides?: Partial<CommunicationMessageReadResult>,
): CommunicationMessageReadResult {
  return {
    id: 'read-1',
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    userId: ACTOR_ID,
    readAt: new Date('2026-05-02T09:00:00.000Z'),
    metadata: null,
    createdAt: new Date('2026-05-02T09:00:00.000Z'),
    updatedAt: new Date('2026-05-02T09:00:00.000Z'),
    readCount: 1,
    wasCreated: true,
    isSenderRead: false,
    ...(overrides ?? {}),
  };
}

function messageReadersResult(
  overrides?: Partial<CommunicationMessageReadersResult>,
): CommunicationMessageReadersResult {
  return {
    message: {
      id: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      senderUserId: ACTOR_ID,
      kind: CommunicationMessageKind.TEXT,
      status: CommunicationMessageStatus.SENT,
      body: 'Hello',
      clientMessageId: 'client-1',
      replyToMessageId: null,
      editedAt: null,
      hiddenAt: null,
      deletedAt: null,
      sentAt: new Date('2026-05-02T08:00:00.000Z'),
      createdAt: new Date('2026-05-02T08:00:00.000Z'),
      updatedAt: new Date('2026-05-02T08:00:00.000Z'),
      senderUser: {
        id: ACTOR_ID,
        firstName: 'Sara',
        lastName: 'Sender',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      },
    },
    readers: [
      {
        id: 'read-1',
        userId: 'reader-1',
        readAt: new Date('2026-05-02T09:00:00.000Z'),
        user: {
          id: 'reader-1',
          firstName: 'Mona',
          lastName: 'Parent',
          userType: UserType.PARENT,
          status: UserStatus.ACTIVE,
        },
      },
    ],
    readCount: 2,
    participantsCount: 3,
    fullyRead: true,
    total: 2,
    limit: 50,
    page: 1,
    ...(overrides ?? {}),
  };
}

function withScope<T>(fn: () => T, permissions: string[] = []): T {
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
      permissions,
    },
  };

  return runWithRequestContext(context, fn);
}

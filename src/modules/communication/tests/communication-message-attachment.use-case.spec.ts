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
    expect(repository.linkCurrentSchoolMessageAttachment).not.toHaveBeenCalled();
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
              .mockResolvedValue(fileRecord({ sizeBytes: 50n * 1024n * 1024n })),
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
      linkCurrentSchoolMessageAttachment: jest.fn().mockImplementation((input) => {
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

  it('deletes attachment link and audits mutation', async () => {
    let audit: CommunicationAttachmentAuditInput | undefined;
    const repository = repositoryMock({
      deleteCurrentSchoolMessageAttachment: jest.fn().mockImplementation((input) => {
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

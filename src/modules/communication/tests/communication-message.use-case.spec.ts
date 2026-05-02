import {
  AuditOutcome,
  CommunicationConversationStatus,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  RequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import {
  CreateCommunicationMessageUseCase,
  DeleteCommunicationMessageUseCase,
  GetCommunicationMessageUseCase,
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
  CommunicationMessageHiddenException,
  CommunicationMessageSendForbiddenException,
  CommunicationMessageTooLongException,
} from '../domain/communication-message-domain';
import { CommunicationConversationNotMemberException } from '../domain/communication-participant-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import {
  CommunicationMessageAuditInput,
  CommunicationMessageConversationAccessRecord,
  CommunicationMessageParticipantAccessRecord,
  CommunicationMessageReadRecord,
  CommunicationMessageRecord,
  CommunicationMessageRepository,
} from '../infrastructure/communication-message.repository';
import { CommunicationPolicyRepository } from '../infrastructure/communication-policy.repository';

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

  it('delete hides body in response and audits mutation', async () => {
    let audit: CommunicationMessageAuditInput | undefined;
    const repository = repositoryMock({
      deleteOrHideCurrentSchoolMessage: jest.fn().mockImplementation((input) => {
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

  it('mark conversation read returns compact markedCount', async () => {
    const repository = repositoryMock({
      markCurrentSchoolConversationRead: jest.fn().mockResolvedValue({
        conversationId: CONVERSATION_ID,
        readAt: new Date('2026-05-02T09:00:00.000Z'),
        markedCount: 2,
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
    });
    expect(repository.createAuditLog).not.toHaveBeenCalled();
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
    findConversationForMessage: jest.fn().mockResolvedValue(conversationRecord()),
    findActiveParticipantForActor: jest
      .fn()
      .mockResolvedValue(participantRecord()),
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
    }),
    loadCurrentSchoolConversationReadSummary: jest.fn().mockResolvedValue({
      conversationId: CONVERSATION_ID,
      items: [{ messageId: MESSAGE_ID, readCount: 1 }],
      total: 1,
      limit: 50,
      page: 1,
    }),
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
    ...(overrides ?? {}),
  };
}

function readRecord(
  overrides?: Partial<CommunicationMessageReadRecord>,
): CommunicationMessageReadRecord {
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

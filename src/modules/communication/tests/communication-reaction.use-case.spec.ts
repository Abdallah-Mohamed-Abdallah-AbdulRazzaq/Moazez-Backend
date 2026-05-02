import {
  AuditOutcome,
  CommunicationConversationStatus,
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
  DeleteCommunicationMessageReactionUseCase,
  ListCommunicationMessageReactionsUseCase,
  UpsertCommunicationMessageReactionUseCase,
} from '../application/communication-reaction.use-cases';
import {
  CommunicationConversationArchivedException,
  CommunicationConversationClosedException,
  CommunicationPolicyDisabledException,
} from '../domain/communication-conversation-domain';
import {
  CommunicationMessageDeletedException,
  CommunicationMessageHiddenException,
} from '../domain/communication-message-domain';
import { CommunicationConversationNotMemberException } from '../domain/communication-participant-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import {
  CommunicationMessageReactionAccessRecord,
  CommunicationMessageReactionParticipantAccessRecord,
  CommunicationMessageReactionRecord,
  CommunicationReactionAuditInput,
  CommunicationReactionRepository,
} from '../infrastructure/communication-reaction.repository';
import { CommunicationPolicyRepository } from '../infrastructure/communication-policy.repository';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'actor-1';
const CONVERSATION_ID = 'conversation-1';
const MESSAGE_ID = 'message-1';
const REACTION_ID = 'reaction-1';

describe('communication reaction use cases', () => {
  it('lists reactions without auditing', async () => {
    const repository = repositoryMock({
      listCurrentSchoolMessageReactions: jest.fn().mockResolvedValue({
        messageId: MESSAGE_ID,
        items: [reactionRecord()],
      }),
    });

    const result = await withScope(() =>
      new ListCommunicationMessageReactionsUseCase(repository).execute(
        MESSAGE_ID,
      ),
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: REACTION_ID,
      type: 'like',
      messageId: MESSAGE_ID,
    });
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('reaction mutation rejects when policy is disabled', async () => {
    const repository = repositoryMock();
    const policyRepository = policyRepositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue({
        ...buildDefaultCommunicationPolicy(),
        isEnabled: false,
      }),
    });

    await expect(
      withScope(() =>
        new UpsertCommunicationMessageReactionUseCase(
          repository,
          policyRepository,
        ).execute(MESSAGE_ID, { type: 'like' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationPolicyDisabledException);
    expect(repository.upsertCurrentSchoolMessageReaction).not.toHaveBeenCalled();
  });

  it('reaction mutation rejects archived and closed conversations', async () => {
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
        ),
    });
    const useCase = new UpsertCommunicationMessageReactionUseCase(
      repository,
      policyRepositoryMock(),
    );

    await expect(
      withScope(() => useCase.execute(MESSAGE_ID, { type: 'like' })),
    ).rejects.toBeInstanceOf(CommunicationConversationArchivedException);
    await expect(
      withScope(() => useCase.execute(MESSAGE_ID, { type: 'like' })),
    ).rejects.toBeInstanceOf(CommunicationConversationClosedException);
  });

  it('reaction mutation rejects hidden or deleted messages', async () => {
    await expect(
      withScope(() =>
        new UpsertCommunicationMessageReactionUseCase(
          repositoryMock({
            findMessageForReactionOrAttachmentAccess: jest
              .fn()
              .mockResolvedValue(
                messageAccessRecord({
                  status: CommunicationMessageStatus.HIDDEN,
                  hiddenAt: new Date('2026-05-02T08:30:00.000Z'),
                }),
              ),
          }),
          policyRepositoryMock(),
        ).execute(MESSAGE_ID, { type: 'like' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationMessageHiddenException);

    await expect(
      withScope(() =>
        new UpsertCommunicationMessageReactionUseCase(
          repositoryMock({
            findMessageForReactionOrAttachmentAccess: jest
              .fn()
              .mockResolvedValue(
                messageAccessRecord({
                  status: CommunicationMessageStatus.DELETED,
                  deletedAt: new Date('2026-05-02T08:30:00.000Z'),
                }),
              ),
          }),
          policyRepositoryMock(),
        ).execute(MESSAGE_ID, { type: 'sad' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationMessageDeletedException);
  });

  it('reaction mutation rejects actors that are not active participants', async () => {
    const repository = repositoryMock({
      findActiveParticipantForActor: jest.fn().mockResolvedValue(null),
    });

    await expect(
      withScope(() =>
        new UpsertCommunicationMessageReactionUseCase(
          repository,
          policyRepositoryMock(),
        ).execute(MESSAGE_ID, { type: 'like' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationConversationNotMemberException);
  });

  it('upserts one actor reaction, audits, and avoids out-of-scope side effects', async () => {
    let audit: CommunicationReactionAuditInput | undefined;
    const repository = repositoryMock({
      upsertCurrentSchoolMessageReaction: jest.fn().mockImplementation((input) => {
        const next = reactionRecord({ reactionKey: 'love' });
        audit = input.buildAuditEntry(next, null);
        return Promise.resolve(next);
      }),
    });

    const result = await withScope(() =>
      new UpsertCommunicationMessageReactionUseCase(
        repository,
        policyRepositoryMock(),
      ).execute(MESSAGE_ID, { type: 'love' }),
    );

    expect(result).toMatchObject({
      id: REACTION_ID,
      type: 'love',
      messageId: MESSAGE_ID,
      userId: ACTOR_ID,
    });
    expect(repository.upsertCurrentSchoolMessageReaction).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        actorId: ACTOR_ID,
        reactionKey: 'love',
      }),
    );
    expect(audit).toMatchObject({
      actorId: ACTOR_ID,
      userType: UserType.SCHOOL_USER,
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      module: 'communication',
      action: 'communication.message_reaction.upsert',
      resourceType: 'communication_message_reaction',
      resourceId: REACTION_ID,
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

  it('deletes actor reaction and audits mutation', async () => {
    let audit: CommunicationReactionAuditInput | undefined;
    const repository = repositoryMock({
      deleteCurrentSchoolMessageReaction: jest.fn().mockImplementation((input) => {
        audit = input.buildAuditEntry(reactionRecord());
        return Promise.resolve({ ok: true });
      }),
    });

    const result = await withScope(() =>
      new DeleteCommunicationMessageReactionUseCase(
        repository,
        policyRepositoryMock(),
      ).execute(MESSAGE_ID),
    );

    expect(result).toEqual({ ok: true });
    expect(audit).toMatchObject({
      action: 'communication.message_reaction.delete',
      after: expect.objectContaining({
        changedFields: ['deleted'],
        reactionId: REACTION_ID,
      }),
    });
  });
});

function repositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationReactionRepository & Record<string, jest.Mock> {
  return {
    listCurrentSchoolMessageReactions: jest.fn().mockResolvedValue({
      messageId: MESSAGE_ID,
      items: [reactionRecord()],
    }),
    findMessageForReactionOrAttachmentAccess: jest
      .fn()
      .mockResolvedValue(messageAccessRecord()),
    findActiveParticipantForActor: jest
      .fn()
      .mockResolvedValue(participantRecord()),
    findCurrentSchoolReactionForActor: jest
      .fn()
      .mockResolvedValue(reactionRecord()),
    upsertCurrentSchoolMessageReaction: jest
      .fn()
      .mockResolvedValue(reactionRecord()),
    deleteCurrentSchoolMessageReaction: jest
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
  } as unknown as CommunicationReactionRepository & Record<string, jest.Mock>;
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
  overrides?: Partial<CommunicationMessageReactionAccessRecord>,
): CommunicationMessageReactionAccessRecord {
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
  overrides?: Partial<CommunicationMessageReactionParticipantAccessRecord>,
): CommunicationMessageReactionParticipantAccessRecord {
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

function reactionRecord(
  overrides?: Partial<CommunicationMessageReactionRecord>,
): CommunicationMessageReactionRecord {
  return {
    id: REACTION_ID,
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    userId: ACTOR_ID,
    reactionKey: 'like',
    emoji: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:00:00.000Z'),
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
      permissions: ['communication.messages.react'],
    },
  };

  return runWithRequestContext(context, fn);
}

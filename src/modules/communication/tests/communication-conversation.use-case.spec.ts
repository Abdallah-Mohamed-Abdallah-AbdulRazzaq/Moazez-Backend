import {
  AuditOutcome,
  CommunicationConversationStatus,
  CommunicationConversationType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  RequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import {
  ArchiveCommunicationConversationUseCase,
  CloseCommunicationConversationUseCase,
  CreateCommunicationConversationUseCase,
  GetCommunicationConversationUseCase,
  ListCommunicationConversationsUseCase,
  ReopenCommunicationConversationUseCase,
  UpdateCommunicationConversationUseCase,
} from '../application/communication-conversation.use-cases';
import { CommunicationPolicyDisabledException } from '../domain/communication-conversation-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import {
  CommunicationConversationAuditInput,
  CommunicationConversationRecord,
  CommunicationConversationRepository,
} from '../infrastructure/communication-conversation.repository';
import { CommunicationPolicyRepository } from '../infrastructure/communication-policy.repository';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'actor-1';

describe('communication conversation use cases', () => {
  it('list summarizes zero state safely and reads do not audit', async () => {
    const repository = repositoryMock({
      listCurrentSchoolConversations: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 50,
        page: 1,
        summary: emptyConversationSummary(),
      }),
    });
    const useCase = new ListCommunicationConversationsUseCase(repository);

    const result = await withScope(() => useCase.execute({}));

    expect(result.items).toEqual([]);
    expect(result.summary.total).toBe(0);
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('detail returns safe metadata only and does not audit', async () => {
    const repository = repositoryMock({
      findCurrentSchoolConversationById: jest.fn().mockResolvedValue(
        conversationRecord({
          metadata: {
            schoolId: SCHOOL_ID,
            body: 'private body',
            topic: 'math',
          },
        }),
      ),
      countConversationParticipants: jest.fn().mockResolvedValue({
        total: 1,
        active: 1,
        invited: 0,
        left: 0,
        removed: 0,
        muted: 0,
        blocked: 0,
      }),
    });
    const useCase = new GetCommunicationConversationUseCase(repository);

    const result = await withScope(() => useCase.execute('conversation-1'));
    const json = JSON.stringify(result);

    expect(result.metadata).toEqual({ topic: 'math' });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('private body');
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('create rejects when policy is disabled', async () => {
    const repository = repositoryMock();
    const policyRepository = policyRepositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue({
        ...buildDefaultCommunicationPolicy(),
        id: 'policy-1',
        isEnabled: false,
      }),
    });
    const useCase = new CreateCommunicationConversationUseCase(
      repository,
      policyRepository,
    );

    await expect(
      withScope(() =>
        useCase.execute({
          type: 'group',
          title: 'Math group',
        }),
      ),
    ).rejects.toBeInstanceOf(CommunicationPolicyDisabledException);
    expect(repository.createCurrentSchoolConversation).not.toHaveBeenCalled();
  });

  it('create allows default policy, creates owner participant through repository, audits, and creates no messages or invites', async () => {
    let audit: CommunicationConversationAuditInput | undefined;
    const created = conversationRecord({
      id: 'conversation-created',
      type: CommunicationConversationType.GROUP,
      titleEn: 'Math group',
      metadata: { isReadOnly: true, isPinned: true },
    });
    const repository = repositoryMock({
      createCurrentSchoolConversation: jest.fn().mockImplementation((input) => {
        audit = input.buildAuditEntry(created);
        return Promise.resolve(created);
      }),
    });
    const policyRepository = policyRepositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue(null),
    });
    const useCase = new CreateCommunicationConversationUseCase(
      repository,
      policyRepository,
    );

    const result = await withScope(() =>
      useCase.execute({
        type: 'group',
        title: 'Math group',
        isReadOnly: true,
        isPinned: true,
      }),
    );

    expect(result).toMatchObject({
      id: 'conversation-created',
      type: 'group',
      title: 'Math group',
      isReadOnly: true,
      isPinned: true,
    });
    expect(repository.createCurrentSchoolConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        actorId: ACTOR_ID,
        data: expect.objectContaining({
          type: CommunicationConversationType.GROUP,
          status: CommunicationConversationStatus.ACTIVE,
          titleEn: 'Math group',
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
      action: 'communication.conversation.create',
      resourceType: 'communication_conversation',
      resourceId: 'conversation-created',
      outcome: AuditOutcome.SUCCESS,
    });
    expect(repository.createMessage).not.toHaveBeenCalled();
    expect(repository.createInvite).not.toHaveBeenCalled();
    expect(repository.createJoinRequest).not.toHaveBeenCalled();
  });

  it('update audits mutation and does not create messages', async () => {
    let audit: CommunicationConversationAuditInput | undefined;
    const existing = conversationRecord();
    const updated = conversationRecord({
      titleEn: 'Updated title',
      metadata: { isPinned: true },
    });
    const repository = repositoryMock({
      findCurrentSchoolConversationById: jest.fn().mockResolvedValue(existing),
      updateCurrentSchoolConversation: jest.fn().mockImplementation((input) => {
        audit = input.buildAuditEntry(updated);
        return Promise.resolve(updated);
      }),
    });
    const useCase = new UpdateCommunicationConversationUseCase(repository);

    const result = await withScope(() =>
      useCase.execute('conversation-1', {
        title: 'Updated title',
        isPinned: true,
      }),
    );

    expect(result.title).toBe('Updated title');
    expect(repository.updateCurrentSchoolConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        data: {
          titleEn: 'Updated title',
          metadata: { isPinned: true },
        },
      }),
    );
    expect(audit).toMatchObject({
      action: 'communication.conversation.update',
      before: expect.objectContaining({ targetSchoolId: SCHOOL_ID }),
      after: expect.objectContaining({
        changedFields: ['title', 'isPinned'],
      }),
    });
    expect(repository.createMessage).not.toHaveBeenCalled();
  });

  it('archive close and reopen audit mutations without message side effects', async () => {
    const active = conversationRecord();
    const closed = conversationRecord({
      status: CommunicationConversationStatus.CLOSED,
      closedAt: new Date('2026-05-02T09:00:00.000Z'),
    });
    const archived = conversationRecord({
      status: CommunicationConversationStatus.ARCHIVED,
      archivedAt: new Date('2026-05-02T09:10:00.000Z'),
    });
    const reopened = conversationRecord({
      status: CommunicationConversationStatus.ACTIVE,
      closedAt: null,
      archivedAt: null,
    });
    const audits: CommunicationConversationAuditInput[] = [];
    const repository = repositoryMock({
      findCurrentSchoolConversationById: jest
        .fn()
        .mockResolvedValueOnce(active)
        .mockResolvedValueOnce(active)
        .mockResolvedValueOnce(closed),
      archiveCurrentSchoolConversation: jest.fn().mockImplementation((input) => {
        audits.push(input.buildAuditEntry(archived));
        return Promise.resolve(archived);
      }),
      closeCurrentSchoolConversation: jest.fn().mockImplementation((input) => {
        audits.push(input.buildAuditEntry(closed));
        return Promise.resolve(closed);
      }),
      reopenCurrentSchoolConversation: jest.fn().mockImplementation((input) => {
        audits.push(input.buildAuditEntry(reopened));
        return Promise.resolve(reopened);
      }),
    });

    await withScope(() =>
      new ArchiveCommunicationConversationUseCase(repository).execute(
        'conversation-1',
      ),
    );
    await withScope(() =>
      new CloseCommunicationConversationUseCase(repository).execute(
        'conversation-1',
      ),
    );
    await withScope(() =>
      new ReopenCommunicationConversationUseCase(repository).execute(
        'conversation-1',
      ),
    );

    expect(audits.map((entry) => entry.action)).toEqual([
      'communication.conversation.archive',
      'communication.conversation.close',
      'communication.conversation.reopen',
    ]);
    expect(repository.createMessage).not.toHaveBeenCalled();
    expect(repository.createMessageRead).not.toHaveBeenCalled();
    expect(repository.createMessageDelivery).not.toHaveBeenCalled();
    expect(repository.createMessageReaction).not.toHaveBeenCalled();
    expect(repository.createMessageAttachment).not.toHaveBeenCalled();
  });
});

function repositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationConversationRepository & Record<string, jest.Mock> {
  return {
    listCurrentSchoolConversations: jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      page: 1,
      summary: emptyConversationSummary(),
    }),
    findCurrentSchoolConversationById: jest
      .fn()
      .mockResolvedValue(conversationRecord()),
    createCurrentSchoolConversation: jest
      .fn()
      .mockResolvedValue(conversationRecord()),
    updateCurrentSchoolConversation: jest
      .fn()
      .mockResolvedValue(conversationRecord()),
    archiveCurrentSchoolConversation: jest
      .fn()
      .mockResolvedValue(conversationRecord()),
    closeCurrentSchoolConversation: jest
      .fn()
      .mockResolvedValue(conversationRecord()),
    reopenCurrentSchoolConversation: jest
      .fn()
      .mockResolvedValue(conversationRecord()),
    countConversationParticipants: jest.fn().mockResolvedValue({
      total: 1,
      active: 1,
      invited: 0,
      left: 0,
      removed: 0,
      muted: 0,
      blocked: 0,
    }),
    createCreatorParticipantIfNeeded: jest.fn(),
    findAcademicYear: jest.fn().mockResolvedValue({ id: 'academic-year-1' }),
    findTerm: jest
      .fn()
      .mockResolvedValue({ id: 'term-1', academicYearId: 'academic-year-1' }),
    findStage: jest.fn().mockResolvedValue({ id: 'stage-1' }),
    findGrade: jest.fn().mockResolvedValue({ id: 'grade-1' }),
    findSection: jest.fn().mockResolvedValue({ id: 'section-1' }),
    findClassroom: jest.fn().mockResolvedValue({ id: 'classroom-1' }),
    findSubject: jest.fn().mockResolvedValue({ id: 'subject-1' }),
    createAuditLog: jest.fn(),
    createMessage: jest.fn(),
    createMessageRead: jest.fn(),
    createMessageDelivery: jest.fn(),
    createMessageReaction: jest.fn(),
    createMessageAttachment: jest.fn(),
    createInvite: jest.fn(),
    createJoinRequest: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as CommunicationConversationRepository & Record<string, jest.Mock>;
}

function policyRepositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationPolicyRepository & Record<string, jest.Mock> {
  return {
    findCurrentSchoolPolicy: jest.fn().mockResolvedValue(null),
    ...(overrides ?? {}),
  } as unknown as CommunicationPolicyRepository & Record<string, jest.Mock>;
}

function conversationRecord(
  overrides?: Partial<CommunicationConversationRecord>,
): CommunicationConversationRecord {
  return {
    id: 'conversation-1',
    schoolId: SCHOOL_ID,
    type: CommunicationConversationType.GROUP,
    status: CommunicationConversationStatus.ACTIVE,
    titleEn: 'Conversation',
    titleAr: null,
    descriptionEn: 'Conversation description',
    descriptionAr: null,
    avatarFileId: null,
    academicYearId: null,
    termId: null,
    stageId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
    subjectId: null,
    createdById: ACTOR_ID,
    archivedById: null,
    archivedAt: null,
    closedById: null,
    closedAt: null,
    lastMessageAt: null,
    metadata: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:30:00.000Z'),
    deletedAt: null,
    _count: { participants: 1 },
    ...(overrides ?? {}),
  };
}

function emptyConversationSummary() {
  return {
    total: 0,
    active: 0,
    archived: 0,
    closed: 0,
    direct: 0,
    group: 0,
    classroom: 0,
    grade: 0,
    section: 0,
    stage: 0,
    schoolWide: 0,
    support: 0,
    system: 0,
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
      permissions: [],
    },
  };

  return runWithRequestContext(context, fn);
}

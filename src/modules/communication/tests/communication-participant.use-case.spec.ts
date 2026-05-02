import {
  AuditOutcome,
  CommunicationConversationStatus,
  CommunicationInviteStatus,
  CommunicationJoinRequestStatus,
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
  AcceptCommunicationInviteUseCase,
  AddCommunicationParticipantUseCase,
  ApproveCommunicationJoinRequestUseCase,
  CreateCommunicationInviteUseCase,
  CreateCommunicationJoinRequestUseCase,
  DemoteCommunicationParticipantUseCase,
  LeaveCommunicationConversationUseCase,
  ListCommunicationInvitesUseCase,
  ListCommunicationJoinRequestsUseCase,
  ListCommunicationParticipantsUseCase,
  PromoteCommunicationParticipantUseCase,
  RejectCommunicationInviteUseCase,
  RejectCommunicationJoinRequestUseCase,
  RemoveCommunicationParticipantUseCase,
  UpdateCommunicationParticipantUseCase,
} from '../application/communication-participant.use-cases';
import {
  CommunicationConversationArchivedException,
  CommunicationPolicyDisabledException,
} from '../domain/communication-conversation-domain';
import { CommunicationParticipantCannotRemoveOwnerException } from '../domain/communication-participant-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import {
  CommunicationConversationParticipantReferenceRecord,
  CommunicationInviteRecord,
  CommunicationJoinRequestRecord,
  CommunicationParticipantAuditInput,
  CommunicationParticipantRecord,
  CommunicationParticipantRepository,
} from '../infrastructure/communication-participant.repository';
import { CommunicationPolicyRepository } from '../infrastructure/communication-policy.repository';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'actor-1';
const TARGET_USER_ID = 'target-user-1';
const CONVERSATION_ID = 'conversation-1';

describe('communication participant use cases', () => {
  it('list operations return school-scoped data and do not audit', async () => {
    const repository = repositoryMock({
      listCurrentSchoolParticipants: jest
        .fn()
        .mockResolvedValue([participantRecord()]),
      listCurrentSchoolInvites: jest.fn().mockResolvedValue([inviteRecord()]),
      listCurrentSchoolJoinRequests: jest
        .fn()
        .mockResolvedValue([joinRequestRecord()]),
    });

    const [participants, invites, joinRequests] = await withScope(() =>
      Promise.all([
        new ListCommunicationParticipantsUseCase(repository).execute(
          CONVERSATION_ID,
        ),
        new ListCommunicationInvitesUseCase(repository).execute(
          CONVERSATION_ID,
        ),
        new ListCommunicationJoinRequestsUseCase(repository).execute(
          CONVERSATION_ID,
        ),
      ]),
    );

    expect(participants.total).toBe(1);
    expect(invites.total).toBe(1);
    expect(joinRequests.total).toBe(1);
    expect(repository.createAuditLog).not.toHaveBeenCalled();
    expect(repository.createMessage).not.toHaveBeenCalled();
  });

  it('add participant rejects when policy is disabled', async () => {
    const repository = repositoryMock();
    const policyRepository = policyRepositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue({
        ...buildDefaultCommunicationPolicy(),
        isEnabled: false,
      }),
    });

    await expect(
      withScope(() =>
        new AddCommunicationParticipantUseCase(
          repository,
          policyRepository,
        ).execute(CONVERSATION_ID, { userId: TARGET_USER_ID }),
      ),
    ).rejects.toBeInstanceOf(CommunicationPolicyDisabledException);
    expect(repository.addCurrentSchoolParticipant).not.toHaveBeenCalled();
  });

  it('participant mutations reject on archived conversations', async () => {
    const repository = repositoryMock({
      findCurrentSchoolConversationById: jest
        .fn()
        .mockResolvedValue(
          conversationRecord({
            status: CommunicationConversationStatus.ARCHIVED,
          }),
        ),
    });

    await expect(
      withScope(() =>
        new UpdateCommunicationParticipantUseCase(
          repository,
          policyRepositoryMock(),
        ).execute(CONVERSATION_ID, 'participant-1', { role: 'moderator' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationConversationArchivedException);
    expect(repository.updateCurrentSchoolParticipant).not.toHaveBeenCalled();
  });

  it('cannot remove leave or demote the last OWNER', async () => {
    const owner = participantRecord({
      userId: ACTOR_ID,
      role: CommunicationParticipantRole.OWNER,
      status: CommunicationParticipantStatus.ACTIVE,
    });
    const repository = repositoryMock({
      findCurrentSchoolParticipantById: jest.fn().mockResolvedValue(owner),
      findCurrentSchoolParticipantByUserId: jest.fn().mockResolvedValue(owner),
      countActiveOwners: jest.fn().mockResolvedValue(1),
    });
    const policyRepository = policyRepositoryMock();

    await expect(
      withScope(() =>
        new RemoveCommunicationParticipantUseCase(
          repository,
          policyRepository,
        ).execute(CONVERSATION_ID, owner.id),
      ),
    ).rejects.toBeInstanceOf(CommunicationParticipantCannotRemoveOwnerException);

    await expect(
      withScope(() =>
        new LeaveCommunicationConversationUseCase(
          repository,
          policyRepository,
        ).execute(CONVERSATION_ID),
      ),
    ).rejects.toBeInstanceOf(CommunicationParticipantCannotRemoveOwnerException);

    await expect(
      withScope(() =>
        new DemoteCommunicationParticipantUseCase(
          repository,
          policyRepository,
        ).execute(CONVERSATION_ID, owner.id, {}),
      ),
    ).rejects.toBeInstanceOf(CommunicationParticipantCannotRemoveOwnerException);
  });

  it('participant mutations audit and create no message announcement or notification side effects', async () => {
    const audits: CommunicationParticipantAuditInput[] = [];

    await withScope(async () => {
      await new AddCommunicationParticipantUseCase(
        repositoryMock({
          addCurrentSchoolParticipant: jest.fn().mockImplementation((input) => {
            const created = participantRecord({ userId: TARGET_USER_ID });
            audits.push(input.buildAuditEntry(created, null));
            return Promise.resolve(created);
          }),
        }),
        policyRepositoryMock(),
      ).execute(CONVERSATION_ID, { userId: TARGET_USER_ID });

      await new UpdateCommunicationParticipantUseCase(
        repositoryMock({
          updateCurrentSchoolParticipant: jest
            .fn()
            .mockImplementation((input) => {
              const updated = participantRecord({
                role: CommunicationParticipantRole.MODERATOR,
              });
              audits.push(input.buildAuditEntry(updated));
              return Promise.resolve(updated);
            }),
        }),
        policyRepositoryMock(),
      ).execute(CONVERSATION_ID, 'participant-1', { role: 'moderator' });

      await new RemoveCommunicationParticipantUseCase(
        repositoryMock({
          removeCurrentSchoolParticipant: jest
            .fn()
            .mockImplementation((input) => {
              const removed = participantRecord({
                status: CommunicationParticipantStatus.REMOVED,
                removedAt: new Date('2026-05-02T09:00:00.000Z'),
                removedById: ACTOR_ID,
              });
              audits.push(input.buildAuditEntry(removed));
              return Promise.resolve(removed);
            }),
        }),
        policyRepositoryMock(),
      ).execute(CONVERSATION_ID, 'participant-1');

      await new LeaveCommunicationConversationUseCase(
        repositoryMock({
          findCurrentSchoolParticipantByUserId: jest
            .fn()
            .mockResolvedValue(participantRecord({ userId: ACTOR_ID })),
          leaveCurrentSchoolConversation: jest
            .fn()
            .mockImplementation((input) => {
              const left = participantRecord({
                userId: ACTOR_ID,
                status: CommunicationParticipantStatus.LEFT,
                leftAt: new Date('2026-05-02T09:10:00.000Z'),
              });
              audits.push(input.buildAuditEntry(left));
              return Promise.resolve(left);
            }),
        }),
        policyRepositoryMock(),
      ).execute(CONVERSATION_ID);

      await new PromoteCommunicationParticipantUseCase(
        repositoryMock({
          promoteCurrentSchoolParticipant: jest
            .fn()
            .mockImplementation((input) => {
              const promoted = participantRecord({
                role: CommunicationParticipantRole.MODERATOR,
              });
              audits.push(input.buildAuditEntry(promoted));
              return Promise.resolve(promoted);
            }),
        }),
        policyRepositoryMock(),
      ).execute(CONVERSATION_ID, 'participant-1', {});

      await new DemoteCommunicationParticipantUseCase(
        repositoryMock({
          findCurrentSchoolParticipantById: jest.fn().mockResolvedValue(
            participantRecord({
              role: CommunicationParticipantRole.ADMIN,
            }),
          ),
          demoteCurrentSchoolParticipant: jest
            .fn()
            .mockImplementation((input) => {
              const demoted = participantRecord({
                role: CommunicationParticipantRole.MODERATOR,
              });
              audits.push(input.buildAuditEntry(demoted));
              return Promise.resolve(demoted);
            }),
        }),
        policyRepositoryMock(),
      ).execute(CONVERSATION_ID, 'participant-1', {});
    });

    expect(audits.map((entry) => entry.action)).toEqual([
      'communication.participant.add',
      'communication.participant.update',
      'communication.participant.remove',
      'communication.participant.leave',
      'communication.participant.promote',
      'communication.participant.demote',
    ]);
    for (const audit of audits) {
      expect(audit).toMatchObject({
        actorId: ACTOR_ID,
        userType: UserType.SCHOOL_USER,
        organizationId: ORGANIZATION_ID,
        schoolId: SCHOOL_ID,
        module: 'communication',
        resourceType: 'communication_participant',
        outcome: AuditOutcome.SUCCESS,
      });
      expect(audit.after).toMatchObject({
        targetSchoolId: SCHOOL_ID,
        actorId: ACTOR_ID,
      });
    }
  });

  it('invite create accept and reject audit without message side effects', async () => {
    const audits: CommunicationParticipantAuditInput[] = [];

    await withScope(async () => {
      await new CreateCommunicationInviteUseCase(
        repositoryMock({
          createCurrentSchoolInvite: jest.fn().mockImplementation((input) => {
            const created = inviteRecord();
            audits.push(input.buildAuditEntry(created));
            return Promise.resolve(created);
          }),
        }),
        policyRepositoryMock(),
      ).execute(CONVERSATION_ID, { invitedUserId: TARGET_USER_ID });
    });

    await withScope(async () => {
      await new AcceptCommunicationInviteUseCase(
        repositoryMock({
          findCurrentSchoolInviteById: jest.fn().mockResolvedValue(
            inviteRecord({
              invitedUserId: ACTOR_ID,
            }),
          ),
          findCurrentSchoolParticipantByUserId: jest.fn().mockResolvedValue(null),
          acceptCurrentSchoolInvite: jest.fn().mockImplementation((input) => {
            const participant = participantRecord({ userId: ACTOR_ID });
            const accepted = inviteRecord({
              invitedUserId: ACTOR_ID,
              status: CommunicationInviteStatus.ACCEPTED,
              respondedAt: new Date('2026-05-02T09:00:00.000Z'),
            });
            audits.push(input.buildAuditEntry(participant, accepted));
            return Promise.resolve(participant);
          }),
        }),
        policyRepositoryMock(),
      ).execute('invite-1');
    });

    await withScope(async () => {
      const repository = repositoryMock({
        findCurrentSchoolInviteById: jest.fn().mockResolvedValue(
          inviteRecord({
            invitedUserId: ACTOR_ID,
          }),
        ),
        rejectCurrentSchoolInvite: jest.fn().mockImplementation((input) => {
          const rejected = inviteRecord({
            invitedUserId: ACTOR_ID,
            status: CommunicationInviteStatus.REJECTED,
            respondedAt: new Date('2026-05-02T09:10:00.000Z'),
          });
          audits.push(input.buildAuditEntry(rejected));
          return Promise.resolve(rejected);
        }),
      });

      await new RejectCommunicationInviteUseCase(
        repository,
        policyRepositoryMock(),
      ).execute('invite-1', { reason: 'Not now' });
      expect(repository.addCurrentSchoolParticipant).not.toHaveBeenCalled();
      expect(repository.acceptCurrentSchoolInvite).not.toHaveBeenCalled();
    });

    expect(audits.map((entry) => entry.action)).toEqual([
      'communication.invite.create',
      'communication.invite.accept',
      'communication.invite.reject',
    ]);
    expect(audits.map((entry) => entry.resourceType)).toEqual([
      'communication_invite',
      'communication_invite',
      'communication_invite',
    ]);
  });

  it('join request create approve and reject audit without message side effects', async () => {
    const audits: CommunicationParticipantAuditInput[] = [];

    await withScope(async () => {
      await new CreateCommunicationJoinRequestUseCase(
        repositoryMock({
          findCurrentSchoolParticipantByUserId: jest.fn().mockResolvedValue(null),
          createCurrentSchoolJoinRequest: jest
            .fn()
            .mockImplementation((input) => {
              const created = joinRequestRecord();
              audits.push(input.buildAuditEntry(created));
              return Promise.resolve(created);
            }),
        }),
        policyRepositoryMock(),
      ).execute(CONVERSATION_ID, { note: 'Please add me' });
    }, TARGET_USER_ID);

    await withScope(async () => {
      await new ApproveCommunicationJoinRequestUseCase(
        repositoryMock({
          findCurrentSchoolJoinRequestById: jest
            .fn()
            .mockResolvedValue(joinRequestRecord()),
          findCurrentSchoolParticipantByUserId: jest.fn().mockResolvedValue(null),
          approveCurrentSchoolJoinRequest: jest
            .fn()
            .mockImplementation((input) => {
              const participant = participantRecord({
                userId: TARGET_USER_ID,
              });
              const approved = joinRequestRecord({
                status: CommunicationJoinRequestStatus.APPROVED,
                reviewedById: ACTOR_ID,
                reviewedAt: new Date('2026-05-02T09:20:00.000Z'),
              });
              audits.push(input.buildAuditEntry(participant, approved));
              return Promise.resolve(participant);
            }),
        }),
        policyRepositoryMock(),
      ).execute('join-request-1', { reason: 'Approved' });
    });

    await withScope(async () => {
      const repository = repositoryMock({
        findCurrentSchoolJoinRequestById: jest
          .fn()
          .mockResolvedValue(joinRequestRecord()),
        rejectCurrentSchoolJoinRequest: jest
          .fn()
          .mockImplementation((input) => {
            const rejected = joinRequestRecord({
              status: CommunicationJoinRequestStatus.REJECTED,
              reviewedById: ACTOR_ID,
              reviewedAt: new Date('2026-05-02T09:30:00.000Z'),
            });
            audits.push(input.buildAuditEntry(rejected));
            return Promise.resolve(rejected);
          }),
      });

      await new RejectCommunicationJoinRequestUseCase(
        repository,
        policyRepositoryMock(),
      ).execute('join-request-1', { reason: 'Rejected' });
      expect(repository.addCurrentSchoolParticipant).not.toHaveBeenCalled();
      expect(repository.approveCurrentSchoolJoinRequest).not.toHaveBeenCalled();
    });

    expect(audits.map((entry) => entry.action)).toEqual([
      'communication.join_request.create',
      'communication.join_request.approve',
      'communication.join_request.reject',
    ]);
    expect(audits.map((entry) => entry.resourceType)).toEqual([
      'communication_join_request',
      'communication_join_request',
      'communication_join_request',
    ]);
  });
});

function repositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationParticipantRepository & Record<string, jest.Mock> {
  return {
    findCurrentSchoolConversationById: jest
      .fn()
      .mockResolvedValue(conversationRecord()),
    listCurrentSchoolParticipants: jest.fn().mockResolvedValue([]),
    findCurrentSchoolParticipantById: jest
      .fn()
      .mockResolvedValue(participantRecord()),
    findCurrentSchoolParticipantByUserId: jest.fn().mockResolvedValue(null),
    addCurrentSchoolParticipant: jest
      .fn()
      .mockResolvedValue(participantRecord()),
    updateCurrentSchoolParticipant: jest
      .fn()
      .mockResolvedValue(participantRecord()),
    removeCurrentSchoolParticipant: jest
      .fn()
      .mockResolvedValue(participantRecord()),
    leaveCurrentSchoolConversation: jest
      .fn()
      .mockResolvedValue(participantRecord()),
    promoteCurrentSchoolParticipant: jest
      .fn()
      .mockResolvedValue(participantRecord()),
    demoteCurrentSchoolParticipant: jest
      .fn()
      .mockResolvedValue(participantRecord()),
    countActiveOwners: jest.fn().mockResolvedValue(2),
    findCurrentSchoolUserForParticipantTarget: jest.fn().mockResolvedValue({
      id: 'membership-1',
      userId: TARGET_USER_ID,
      schoolId: SCHOOL_ID,
      userType: UserType.SCHOOL_USER,
      user: {
        id: TARGET_USER_ID,
        firstName: 'Target',
        lastName: 'User',
        userType: UserType.SCHOOL_USER,
      },
    }),
    listCurrentSchoolInvites: jest.fn().mockResolvedValue([]),
    findCurrentSchoolInviteById: jest.fn().mockResolvedValue(inviteRecord()),
    hasPendingCurrentSchoolInvite: jest.fn().mockResolvedValue(false),
    createCurrentSchoolInvite: jest.fn().mockResolvedValue(inviteRecord()),
    acceptCurrentSchoolInvite: jest
      .fn()
      .mockResolvedValue(participantRecord()),
    rejectCurrentSchoolInvite: jest.fn().mockResolvedValue(inviteRecord()),
    listCurrentSchoolJoinRequests: jest.fn().mockResolvedValue([]),
    findCurrentSchoolJoinRequestById: jest
      .fn()
      .mockResolvedValue(joinRequestRecord()),
    hasPendingCurrentSchoolJoinRequest: jest.fn().mockResolvedValue(false),
    createCurrentSchoolJoinRequest: jest
      .fn()
      .mockResolvedValue(joinRequestRecord()),
    approveCurrentSchoolJoinRequest: jest
      .fn()
      .mockResolvedValue(participantRecord()),
    rejectCurrentSchoolJoinRequest: jest
      .fn()
      .mockResolvedValue(joinRequestRecord()),
    createAuditLog: jest.fn(),
    createMessage: jest.fn(),
    createMessageRead: jest.fn(),
    createMessageDelivery: jest.fn(),
    createMessageReaction: jest.fn(),
    createMessageAttachment: jest.fn(),
    createAnnouncement: jest.fn(),
    createNotification: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as CommunicationParticipantRepository & Record<string, jest.Mock>;
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
  overrides?: Partial<CommunicationConversationParticipantReferenceRecord>,
): CommunicationConversationParticipantReferenceRecord {
  return {
    id: CONVERSATION_ID,
    schoolId: SCHOOL_ID,
    status: CommunicationConversationStatus.ACTIVE,
    ...(overrides ?? {}),
  };
}

function participantRecord(
  overrides?: Partial<CommunicationParticipantRecord>,
): CommunicationParticipantRecord {
  return {
    id: 'participant-1',
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    userId: TARGET_USER_ID,
    role: CommunicationParticipantRole.MEMBER,
    status: CommunicationParticipantStatus.ACTIVE,
    joinedAt: new Date('2026-05-02T08:00:00.000Z'),
    invitedById: ACTOR_ID,
    leftAt: null,
    removedById: null,
    removedAt: null,
    mutedUntil: null,
    metadata: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:30:00.000Z'),
    user: {
      id: TARGET_USER_ID,
      firstName: 'Target',
      lastName: 'User',
      userType: UserType.SCHOOL_USER,
    },
    ...(overrides ?? {}),
  };
}

function inviteRecord(
  overrides?: Partial<CommunicationInviteRecord>,
): CommunicationInviteRecord {
  return {
    id: 'invite-1',
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    invitedUserId: TARGET_USER_ID,
    invitedById: ACTOR_ID,
    status: CommunicationInviteStatus.PENDING,
    expiresAt: null,
    respondedAt: null,
    metadata: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:30:00.000Z'),
    invitedUser: {
      id: TARGET_USER_ID,
      firstName: 'Target',
      lastName: 'User',
      userType: UserType.SCHOOL_USER,
    },
    ...(overrides ?? {}),
  };
}

function joinRequestRecord(
  overrides?: Partial<CommunicationJoinRequestRecord>,
): CommunicationJoinRequestRecord {
  return {
    id: 'join-request-1',
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    requestedById: TARGET_USER_ID,
    reviewedById: null,
    status: CommunicationJoinRequestStatus.PENDING,
    reviewedAt: null,
    metadata: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:30:00.000Z'),
    requestedBy: {
      id: TARGET_USER_ID,
      firstName: 'Target',
      lastName: 'User',
      userType: UserType.SCHOOL_USER,
    },
    ...(overrides ?? {}),
  };
}

function withScope<T>(fn: () => T, actorId = ACTOR_ID): T {
  const context: RequestContext = {
    ...createRequestContext(),
    actor: {
      id: actorId,
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

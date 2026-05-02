import { AuditOutcome, UserType } from '@prisma/client';
import {
  createRequestContext,
  RequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import {
  GetCommunicationAdminOverviewUseCase,
  GetCommunicationPolicyUseCase,
  UpdateCommunicationPolicyUseCase,
} from '../application/communication-policy.use-cases';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import { CommunicationPolicyRepository } from '../infrastructure/communication-policy.repository';
import { buildEmptyCommunicationOverviewCounts } from '../presenters/communication-admin.presenter';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'actor-1';

describe('communication policy use cases', () => {
  it('GET policy returns isConfigured=false when no row exists', async () => {
    const repository = repositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue(null),
    });
    const useCase = new GetCommunicationPolicyUseCase(repository);

    const result = await withScope(() => useCase.execute());

    expect(result.isConfigured).toBe(false);
    expect(result.isEnabled).toBe(true);
    expect(result.studentDirectMode).toBe('disabled');
    expect(repository.upsertCurrentSchoolPolicy).not.toHaveBeenCalled();
  });

  it('reads do not audit', async () => {
    const repository = repositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue(null),
    });
    const auth = authRepositoryMock();
    const policyUseCase = new GetCommunicationPolicyUseCase(repository);
    const overviewUseCase = new GetCommunicationAdminOverviewUseCase(
      repository,
    );

    await withScope(() => policyUseCase.execute());
    await withScope(() => overviewUseCase.execute());

    expect(auth.createAuditLog).not.toHaveBeenCalled();
    expect(repository.upsertCurrentSchoolPolicy).not.toHaveBeenCalled();
  });

  it('disabled policy remains readable', async () => {
    const repository = repositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue({
        ...buildDefaultCommunicationPolicy(),
        id: 'policy-1',
        isEnabled: false,
        studentDirectMode: 'SAME_SCHOOL',
      }),
    });
    const useCase = new GetCommunicationPolicyUseCase(repository);

    const result = await withScope(() => useCase.execute());

    expect(result.isConfigured).toBe(true);
    expect(result.isEnabled).toBe(false);
    expect(result.studentDirectMode).toBe('same_school');
  });

  it('update/upsert audits mutation', async () => {
    const updated = {
      ...buildDefaultCommunicationPolicy(),
      id: 'policy-1',
      isEnabled: false,
      maxGroupMembers: 64,
      updatedById: ACTOR_ID,
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
      updatedAt: new Date('2026-05-01T10:10:00.000Z'),
    };
    const repository = repositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue(null),
      upsertCurrentSchoolPolicy: jest.fn().mockResolvedValue(updated),
    });
    const auth = authRepositoryMock();
    const useCase = new UpdateCommunicationPolicyUseCase(repository, auth);

    const result = await withScope(() =>
      useCase.execute({ isEnabled: false, maxGroupMembers: 64 }),
    );

    expect(result.isConfigured).toBe(true);
    expect(repository.upsertCurrentSchoolPolicy).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      actorId: ACTOR_ID,
      data: { isEnabled: false, maxGroupMembers: 64 },
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ACTOR_ID,
        userType: UserType.SCHOOL_USER,
        organizationId: ORGANIZATION_ID,
        schoolId: SCHOOL_ID,
        module: 'communication',
        action: 'communication.policy.create',
        resourceType: 'communication_policy',
        resourceId: 'policy-1',
        outcome: AuditOutcome.SUCCESS,
        after: expect.objectContaining({
          targetSchoolId: SCHOOL_ID,
          actorId: ACTOR_ID,
          changedFields: ['isEnabled', 'maxGroupMembers'],
        }),
      }),
    );
  });

  it('updates an existing policy and audits before/after', async () => {
    const existing = {
      ...buildDefaultCommunicationPolicy(),
      id: 'policy-1',
      maxMessageLength: 4000,
    };
    const updated = {
      ...existing,
      maxMessageLength: 8000,
      updatedById: ACTOR_ID,
    };
    const repository = repositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue(existing),
      upsertCurrentSchoolPolicy: jest.fn().mockResolvedValue(updated),
    });
    const auth = authRepositoryMock();
    const useCase = new UpdateCommunicationPolicyUseCase(repository, auth);

    await withScope(() => useCase.execute({ maxMessageLength: 8000 }));

    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'communication.policy.update',
        before: expect.objectContaining({
          targetSchoolId: SCHOOL_ID,
        }),
        after: expect.objectContaining({
          changedFields: ['maxMessageLength'],
        }),
      }),
    );
  });

  it('admin overview summarizes zero state safely and does not expose message body', async () => {
    const repository = repositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue(null),
      loadSchoolAdminOverview: jest.fn().mockResolvedValue({
        counts: buildEmptyCommunicationOverviewCounts(),
        recentActivity: {
          conversations: [],
          messages: [
            {
              id: 'message-1',
              conversationId: 'conversation-1',
              senderUserId: 'user-1',
              kind: 'TEXT',
              status: 'SENT',
              sentAt: new Date('2026-05-01T10:00:00.000Z'),
              createdAt: new Date('2026-05-01T10:00:00.000Z'),
              updatedAt: new Date('2026-05-01T10:00:00.000Z'),
              body: 'private',
            },
          ],
        },
      }),
    });
    const useCase = new GetCommunicationAdminOverviewUseCase(repository);

    const result = await withScope(() => useCase.execute());
    const json = JSON.stringify(result);

    expect(result.policy.isConfigured).toBe(false);
    expect(result.conversations.total).toBe(0);
    expect(json).not.toContain('body');
    expect(json).not.toContain('private');
  });

  it('policy update does not create chat or announcement side effects', async () => {
    const repository = repositoryMock({
      findCurrentSchoolPolicy: jest.fn().mockResolvedValue(null),
      upsertCurrentSchoolPolicy: jest
        .fn()
        .mockResolvedValue({ ...buildDefaultCommunicationPolicy(), id: 'p1' }),
      createConversation: jest.fn(),
      createMessage: jest.fn(),
      createParticipant: jest.fn(),
      createAnnouncement: jest.fn(),
      createNotification: jest.fn(),
    });
    const useCase = new UpdateCommunicationPolicyUseCase(
      repository,
      authRepositoryMock(),
    );

    await withScope(() => useCase.execute({ allowAttachments: false }));

    expect(repository.createConversation).not.toHaveBeenCalled();
    expect(repository.createMessage).not.toHaveBeenCalled();
    expect(repository.createParticipant).not.toHaveBeenCalled();
    expect(repository.createAnnouncement).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
  });
});

function repositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationPolicyRepository & Record<string, jest.Mock> {
  return {
    findCurrentSchoolPolicy: jest.fn().mockResolvedValue(null),
    upsertCurrentSchoolPolicy: jest.fn(),
    loadSchoolAdminOverview: jest.fn().mockResolvedValue({
      counts: buildEmptyCommunicationOverviewCounts(),
      recentActivity: { conversations: [], messages: [] },
    }),
    ...(overrides ?? {}),
  } as unknown as CommunicationPolicyRepository & Record<string, jest.Mock>;
}

function authRepositoryMock(): AuthRepository & {
  createAuditLog: jest.Mock;
} {
  return {
    createAuditLog: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthRepository & { createAuditLog: jest.Mock };
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

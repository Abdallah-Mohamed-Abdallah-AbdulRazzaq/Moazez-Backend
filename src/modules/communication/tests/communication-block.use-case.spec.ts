import { AuditOutcome, MembershipStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  RequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  CreateCommunicationUserBlockUseCase,
  DeleteCommunicationUserBlockUseCase,
  ListCommunicationUserBlocksUseCase,
} from '../application/communication-block.use-cases';
import { CommunicationConversationScopeInvalidException } from '../domain/communication-conversation-domain';
import {
  CommunicationBlockAuditInput,
  CommunicationBlockRepository,
} from '../infrastructure/communication-block.repository';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'actor-1';
const TARGET_ID = 'target-1';
const BLOCK_ID = 'block-1';

describe('communication block use cases', () => {
  it('lists current actor blocks without auditing', async () => {
    const repository = repositoryMock();

    const result = await withScope(() =>
      new ListCommunicationUserBlocksUseCase(repository).execute(),
    );

    expect(result.items[0]).toMatchObject({
      id: BLOCK_ID,
      targetUserId: TARGET_ID,
      status: 'active',
    });
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('rejects self-block and missing target membership', async () => {
    await expect(
      withScope(() =>
        new CreateCommunicationUserBlockUseCase(repositoryMock()).execute({
          targetUserId: ACTOR_ID,
        }),
      ),
    ).rejects.toBeInstanceOf(CommunicationConversationScopeInvalidException);

    await expect(
      withScope(() =>
        new CreateCommunicationUserBlockUseCase(
          repositoryMock({
            findCurrentSchoolUserMembership: jest.fn().mockResolvedValue(null),
          }),
        ).execute({ targetUserId: TARGET_ID }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('creates and deletes own block with audit rows only', async () => {
    let createAudit: CommunicationBlockAuditInput | undefined;
    let deleteAudit: CommunicationBlockAuditInput | undefined;
    const repository = repositoryMock({
      createCurrentSchoolUserBlock: jest.fn().mockImplementation((input) => {
        const block = blockRecord();
        createAudit = input.buildAuditEntry(block);
        return Promise.resolve(block);
      }),
      deleteCurrentSchoolUserBlock: jest.fn().mockImplementation((input) => {
        const block = blockRecord({
          unblockedAt: new Date('2026-05-02T09:00:00.000Z'),
        });
        deleteAudit = input.buildAuditEntry(block);
        return Promise.resolve(block);
      }),
    });

    const created = await withScope(() =>
      new CreateCommunicationUserBlockUseCase(repository).execute({
        targetUserId: TARGET_ID,
        reason: 'Boundary',
      }),
    );
    const deleted = await withScope(() =>
      new DeleteCommunicationUserBlockUseCase(repository).execute(BLOCK_ID),
    );

    expect(created).toMatchObject({ id: BLOCK_ID, status: 'active' });
    expect(deleted).toMatchObject({ id: BLOCK_ID, status: 'inactive' });
    expect(createAudit).toMatchObject({
      action: 'communication.user_block.create',
      resourceType: 'communication_user_block',
      outcome: AuditOutcome.SUCCESS,
    });
    expect(deleteAudit).toMatchObject({
      actorId: ACTOR_ID,
      userType: UserType.SCHOOL_USER,
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      action: 'communication.user_block.delete',
      resourceId: BLOCK_ID,
    });
    expect(repository.createAnnouncement).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
    expect(repository.enqueueJob).not.toHaveBeenCalled();
    expect(repository.emitRealtime).not.toHaveBeenCalled();
  });

  it('does not allow deleting another actor block', async () => {
    await expect(
      withScope(() =>
        new DeleteCommunicationUserBlockUseCase(
          repositoryMock({
            findCurrentActorBlockById: jest.fn().mockResolvedValue(null),
          }),
        ).execute(BLOCK_ID),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });
});

function repositoryMock(overrides?: Record<string, unknown>) {
  return {
    listCurrentActorBlocks: jest.fn().mockResolvedValue([blockRecord()]),
    findCurrentSchoolActiveBlock: jest.fn().mockResolvedValue(null),
    findCurrentActorBlockById: jest.fn().mockResolvedValue(blockRecord()),
    findCurrentSchoolUserMembership: jest.fn().mockResolvedValue({
      id: 'membership-target',
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      userId: TARGET_ID,
      userType: UserType.SCHOOL_USER,
      status: MembershipStatus.ACTIVE,
    }),
    createCurrentSchoolUserBlock: jest.fn().mockResolvedValue(blockRecord()),
    deleteCurrentSchoolUserBlock: jest.fn().mockResolvedValue(blockRecord()),
    createAuditLog: jest.fn(),
    createAnnouncement: jest.fn(),
    createNotification: jest.fn(),
    enqueueJob: jest.fn(),
    emitRealtime: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as CommunicationBlockRepository & Record<string, jest.Mock>;
}

function blockRecord(overrides?: Record<string, unknown>) {
  const now = new Date('2026-05-02T08:00:00.000Z');
  return {
    id: BLOCK_ID,
    schoolId: SCHOOL_ID,
    blockerUserId: ACTOR_ID,
    blockedUserId: TARGET_ID,
    reason: 'Boundary',
    unblockedAt: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...(overrides ?? {}),
  } as any;
}

function withScope<T>(fn: () => T): T {
  const context: RequestContext = {
    ...createRequestContext(),
    actor: { id: ACTOR_ID, userType: UserType.SCHOOL_USER },
    activeMembership: {
      membershipId: 'membership-1',
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      roleId: 'role-1',
      permissions: ['communication.conversations.view'],
    },
  };

  return runWithRequestContext(context, fn);
}

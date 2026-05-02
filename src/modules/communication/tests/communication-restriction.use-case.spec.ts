import {
  AuditOutcome,
  CommunicationRestrictionType,
  MembershipStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  RequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  CreateCommunicationUserRestrictionUseCase,
  ListCommunicationUserRestrictionsUseCase,
  RevokeCommunicationUserRestrictionUseCase,
  UpdateCommunicationUserRestrictionUseCase,
} from '../application/communication-restriction.use-cases';
import {
  CommunicationRestrictionAuditInput,
  CommunicationRestrictionRepository,
} from '../infrastructure/communication-restriction.repository';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'moderator-1';
const TARGET_ID = 'target-1';
const RESTRICTION_ID = 'restriction-1';

describe('communication restriction use cases', () => {
  it('lists restrictions without auditing', async () => {
    const repository = repositoryMock();

    const result = await withScope(() =>
      new ListCommunicationUserRestrictionsUseCase(repository).execute({}),
    );

    expect(result.items[0]).toMatchObject({
      id: RESTRICTION_ID,
      targetUserId: TARGET_ID,
      type: 'mute',
      status: 'active',
    });
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('validates target user belongs to current school', async () => {
    await expect(
      withScope(() =>
        new CreateCommunicationUserRestrictionUseCase(
          repositoryMock({
            findCurrentSchoolUserMembership: jest.fn().mockResolvedValue(null),
          }),
        ).execute({
          targetUserId: TARGET_ID,
          type: 'mute',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('creates updates and revokes restrictions with audit rows only', async () => {
    let createAudit: CommunicationRestrictionAuditInput | undefined;
    let updateAudit: CommunicationRestrictionAuditInput | undefined;
    let revokeAudit: CommunicationRestrictionAuditInput | undefined;
    const repository = repositoryMock({
      createCurrentSchoolUserRestriction: jest
        .fn()
        .mockImplementation((input) => {
          const restriction = restrictionRecord();
          createAudit = input.buildAuditEntry(restriction);
          return Promise.resolve(restriction);
        }),
      updateCurrentSchoolUserRestriction: jest
        .fn()
        .mockImplementation((input) => {
          const restriction = restrictionRecord({ reason: 'Updated' });
          updateAudit = input.buildAuditEntry(restriction);
          return Promise.resolve(restriction);
        }),
      revokeCurrentSchoolUserRestriction: jest
        .fn()
        .mockImplementation((input) => {
          const restriction = restrictionRecord({
            liftedAt: new Date('2026-05-02T10:00:00.000Z'),
            liftedById: ACTOR_ID,
          });
          revokeAudit = input.buildAuditEntry(restriction);
          return Promise.resolve(restriction);
        }),
    });

    const created = await withScope(() =>
      new CreateCommunicationUserRestrictionUseCase(repository).execute({
        targetUserId: TARGET_ID,
        type: 'mute',
        reason: 'Cooldown',
        expiresAt: '2026-05-03T08:00:00.000Z',
      }),
    );
    const updated = await withScope(() =>
      new UpdateCommunicationUserRestrictionUseCase(repository).execute(
        RESTRICTION_ID,
        { reason: 'Updated' },
      ),
    );
    const revoked = await withScope(() =>
      new RevokeCommunicationUserRestrictionUseCase(repository).execute(
        RESTRICTION_ID,
      ),
    );

    expect(created).toMatchObject({ id: RESTRICTION_ID, type: 'mute' });
    expect(updated).toMatchObject({ reason: 'Updated' });
    expect(revoked).toMatchObject({ status: 'lifted', liftedById: ACTOR_ID });
    expect(createAudit).toMatchObject({
      action: 'communication.user_restriction.create',
      resourceType: 'communication_user_restriction',
      outcome: AuditOutcome.SUCCESS,
    });
    expect(updateAudit).toMatchObject({
      actorId: ACTOR_ID,
      userType: UserType.SCHOOL_USER,
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      action: 'communication.user_restriction.update',
      resourceId: RESTRICTION_ID,
    });
    expect(revokeAudit).toMatchObject({
      action: 'communication.user_restriction.revoke',
      after: expect.objectContaining({ targetUserId: TARGET_ID }),
    });
    expect(repository.createAnnouncement).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
    expect(repository.enqueueJob).not.toHaveBeenCalled();
    expect(repository.emitRealtime).not.toHaveBeenCalled();
  });
});

function repositoryMock(overrides?: Record<string, unknown>) {
  return {
    listCurrentSchoolUserRestrictions: jest.fn().mockResolvedValue({
      items: [restrictionRecord()],
      total: 1,
      limit: 50,
      page: 1,
    }),
    findCurrentSchoolUserRestrictionById: jest
      .fn()
      .mockResolvedValue(restrictionRecord()),
    findCurrentSchoolActiveRestriction: jest.fn().mockResolvedValue(null),
    findCurrentSchoolUserMembership: jest.fn().mockResolvedValue({
      id: 'membership-target',
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      userId: TARGET_ID,
      userType: UserType.SCHOOL_USER,
      status: MembershipStatus.ACTIVE,
    }),
    createCurrentSchoolUserRestriction: jest
      .fn()
      .mockResolvedValue(restrictionRecord()),
    updateCurrentSchoolUserRestriction: jest
      .fn()
      .mockResolvedValue(restrictionRecord()),
    revokeCurrentSchoolUserRestriction: jest
      .fn()
      .mockResolvedValue(restrictionRecord()),
    createAuditLog: jest.fn(),
    createAnnouncement: jest.fn(),
    createNotification: jest.fn(),
    enqueueJob: jest.fn(),
    emitRealtime: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as CommunicationRestrictionRepository & Record<string, jest.Mock>;
}

function restrictionRecord(overrides?: Record<string, unknown>) {
  const now = new Date('2026-05-02T08:00:00.000Z');
  return {
    id: RESTRICTION_ID,
    schoolId: SCHOOL_ID,
    targetUserId: TARGET_ID,
    restrictedById: ACTOR_ID,
    restrictionType: CommunicationRestrictionType.MUTE,
    reason: 'Cooldown',
    startsAt: now,
    expiresAt: new Date('2026-05-03T08:00:00.000Z'),
    liftedById: null,
    liftedAt: null,
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
      permissions: ['communication.messages.moderate'],
    },
  };

  return runWithRequestContext(context, fn);
}

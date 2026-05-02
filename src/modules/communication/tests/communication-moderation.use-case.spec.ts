import {
  AuditOutcome,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationModerationActionType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  RequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import {
  CreateCommunicationModerationActionUseCase,
  ListCommunicationModerationActionsUseCase,
} from '../application/communication-moderation.use-cases';
import { CommunicationMessageHiddenException } from '../domain/communication-message-domain';
import {
  CommunicationModerationAuditInput,
  CommunicationModerationRepository,
} from '../infrastructure/communication-moderation.repository';
import { CommunicationRealtimeEventsService } from '../application/communication-realtime-events.service';
import { REALTIME_SERVER_EVENTS } from '../../../infrastructure/realtime/realtime-event-names';
import { RealtimePublisherService } from '../../../infrastructure/realtime/realtime-publisher.service';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'moderator-1';
const MESSAGE_ID = 'message-1';
const CONVERSATION_ID = 'conversation-1';
const ACTION_ID = 'action-1';

describe('communication moderation use cases', () => {
  it('lists moderation actions without auditing', async () => {
    const repository = repositoryMock();

    const result = await withScope(() =>
      new ListCommunicationModerationActionsUseCase(repository).execute(
        MESSAGE_ID,
      ),
    );

    expect(result.items[0]).toMatchObject({
      id: ACTION_ID,
      action: 'hide',
    });
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('creates hide action, safely updates message state, and audits', async () => {
    let audit: CommunicationModerationAuditInput | undefined;
    const repository = repositoryMock({
      createCurrentSchoolMessageModerationAction: jest
        .fn()
        .mockImplementation((input) => {
          const result = {
            action: actionRecord(),
            message: messageRecord({
              status: CommunicationMessageStatus.HIDDEN,
              hiddenById: ACTOR_ID,
              hiddenAt: new Date('2026-05-02T09:00:00.000Z'),
            }),
          };
          audit = input.buildAuditEntry(result);
          return Promise.resolve(result);
        }),
    });

    const result = await withScope(() =>
      new CreateCommunicationModerationActionUseCase(repository).execute(
        MESSAGE_ID,
        { action: 'hide', reason: 'Unsafe' },
      ),
    );

    expect(result.action).toMatchObject({
      id: ACTION_ID,
      action: 'hide',
      targetUserId: 'sender-1',
    });
    expect(result.message).toMatchObject({
      id: MESSAGE_ID,
      status: 'hidden',
      hiddenById: ACTOR_ID,
    });
    expect(
      repository.createCurrentSchoolMessageModerationAction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        actorUserId: ACTOR_ID,
        actionType: CommunicationModerationActionType.MESSAGE_HIDDEN,
        messageUpdate: expect.objectContaining({
          status: CommunicationMessageStatus.HIDDEN,
          hiddenById: ACTOR_ID,
        }),
      }),
    );
    expect(audit).toMatchObject({
      actorId: ACTOR_ID,
      userType: UserType.SCHOOL_USER,
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      module: 'communication',
      action: 'communication.moderation_action.create',
      resourceType: 'communication_moderation_action',
      resourceId: ACTION_ID,
      outcome: AuditOutcome.SUCCESS,
    });
    expect(repository.hardDeleteMessage).not.toHaveBeenCalled();
    expect(repository.createAnnouncement).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
    expect(repository.enqueueJob).not.toHaveBeenCalled();
    expect(repository.emitRealtime).not.toHaveBeenCalled();
  });

  it('delete action soft-deletes message and never hard-deletes', async () => {
    const repository = repositoryMock();

    await withScope(() =>
      new CreateCommunicationModerationActionUseCase(repository).execute(
        MESSAGE_ID,
        { action: 'delete', reason: 'Unsafe' },
      ),
    );

    expect(
      repository.createCurrentSchoolMessageModerationAction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: CommunicationModerationActionType.MESSAGE_DELETED,
        messageUpdate: expect.objectContaining({
          status: CommunicationMessageStatus.DELETED,
          deletedById: ACTOR_ID,
          deletedAt: expect.any(Date),
        }),
      }),
    );
    expect(repository.hardDeleteMessage).not.toHaveBeenCalled();
  });

  it('message hide moderation publishes message.deleted without moderation details', async () => {
    const repository = repositoryMock({
      createCurrentSchoolMessageModerationAction: jest.fn().mockResolvedValue({
        action: actionRecord(),
        message: messageRecord({
          status: CommunicationMessageStatus.HIDDEN,
          hiddenById: ACTOR_ID,
          hiddenAt: new Date('2026-05-02T09:00:00.000Z'),
        }),
      }),
    });
    const publisher = realtimePublisherMock();

    await withScope(() =>
      new CreateCommunicationModerationActionUseCase(
        repository,
        new CommunicationRealtimeEventsService(publisher),
      ).execute(MESSAGE_ID, { action: 'hide', reason: 'Unsafe' }),
    );

    expect(publisher.publishToConversation).toHaveBeenCalledWith(
      SCHOOL_ID,
      CONVERSATION_ID,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_DELETED,
      {
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        status: 'hidden',
        deletedAt: null,
        hiddenAt: '2026-05-02T09:00:00.000Z',
        eventAt: expect.any(String),
      },
    );

    const payloadJson = JSON.stringify(
      publisher.publishToConversation.mock.calls,
    );
    expect(payloadJson).not.toContain('Unsafe');
    expect(payloadJson).not.toContain('reason');
  });

  it('rejects unsafe hidden target for hide action', async () => {
    await expect(
      withScope(() =>
        new CreateCommunicationModerationActionUseCase(
          repositoryMock({
            findMessageForModeration: jest.fn().mockResolvedValue(
              messageRecord({
                status: CommunicationMessageStatus.HIDDEN,
                hiddenAt: new Date('2026-05-02T08:00:00.000Z'),
              }),
            ),
          }),
        ).execute(MESSAGE_ID, { action: 'hide' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationMessageHiddenException);
  });
});

function repositoryMock(overrides?: Record<string, unknown>) {
  return {
    findMessageForModeration: jest.fn().mockResolvedValue(messageRecord()),
    listCurrentSchoolModerationActionsForMessage: jest.fn().mockResolvedValue({
      messageId: MESSAGE_ID,
      items: [actionRecord()],
    }),
    createCurrentSchoolMessageModerationAction: jest
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({
          action: actionRecord({ actionType: input.actionType }),
          message: messageRecord(),
        }),
      ),
    createAuditLog: jest.fn(),
    hardDeleteMessage: jest.fn(),
    createAnnouncement: jest.fn(),
    createNotification: jest.fn(),
    enqueueJob: jest.fn(),
    emitRealtime: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as CommunicationModerationRepository & Record<string, jest.Mock>;
}

function realtimePublisherMock(): jest.Mocked<RealtimePublisherService> {
  return {
    bindServer: jest.fn(),
    publishToSchool: jest.fn().mockReturnValue(true),
    publishToUser: jest.fn().mockReturnValue(true),
    publishToConversation: jest.fn().mockReturnValue(true),
  } as unknown as jest.Mocked<RealtimePublisherService>;
}

function messageRecord(overrides?: Record<string, unknown>) {
  const now = new Date('2026-05-02T08:00:00.000Z');
  return {
    id: MESSAGE_ID,
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    senderUserId: 'sender-1',
    kind: CommunicationMessageKind.TEXT,
    status: CommunicationMessageStatus.SENT,
    hiddenById: null,
    hiddenAt: null,
    hiddenReason: null,
    deletedById: null,
    deletedAt: null,
    sentAt: now,
    createdAt: now,
    updatedAt: now,
    conversation: {
      id: CONVERSATION_ID,
      schoolId: SCHOOL_ID,
      status: 'ACTIVE',
    },
    ...(overrides ?? {}),
  } as any;
}

function actionRecord(overrides?: Record<string, unknown>) {
  const now = new Date('2026-05-02T08:00:00.000Z');
  return {
    id: ACTION_ID,
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    targetUserId: 'sender-1',
    actorUserId: ACTOR_ID,
    actionType: CommunicationModerationActionType.MESSAGE_HIDDEN,
    reason: 'Unsafe',
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

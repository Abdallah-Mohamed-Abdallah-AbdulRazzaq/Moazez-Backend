import {
  AuditOutcome,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationReportStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  RequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import {
  CreateCommunicationMessageReportUseCase,
  GetCommunicationMessageReportUseCase,
  ListCommunicationMessageReportsUseCase,
  UpdateCommunicationMessageReportUseCase,
} from '../application/communication-report.use-cases';
import {
  CommunicationMessageDeletedException,
  CommunicationMessageHiddenException,
} from '../domain/communication-message-domain';
import {
  CommunicationReportAuditInput,
  CommunicationReportRepository,
} from '../infrastructure/communication-report.repository';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'actor-1';
const MESSAGE_ID = 'message-1';
const CONVERSATION_ID = 'conversation-1';
const REPORT_ID = 'report-1';

describe('communication report use cases', () => {
  it('lists and reads reports without auditing or exposing message body', async () => {
    const repository = repositoryMock({
      listCurrentSchoolMessageReports: jest.fn().mockResolvedValue({
        items: [reportRecord()],
        total: 1,
        limit: 50,
        page: 1,
      }),
    });

    const list = await withScope(() =>
      new ListCommunicationMessageReportsUseCase(repository).execute({}),
    );
    const detail = await withScope(() =>
      new GetCommunicationMessageReportUseCase(repository).execute(REPORT_ID),
    );
    const json = JSON.stringify({ list, detail });

    expect(list.items[0]).toMatchObject({ id: REPORT_ID, status: 'open' });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('body');
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('create rejects hidden and deleted message targets', async () => {
    await expect(
      withScope(() =>
        new CreateCommunicationMessageReportUseCase(
          repositoryMock({
            findMessageForReportAccess: jest.fn().mockResolvedValue(
              messageRecord({
                status: CommunicationMessageStatus.HIDDEN,
                hiddenAt: new Date('2026-05-02T08:00:00.000Z'),
              }),
            ),
          }),
        ).execute(MESSAGE_ID, { reason: 'spam' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationMessageHiddenException);

    await expect(
      withScope(() =>
        new CreateCommunicationMessageReportUseCase(
          repositoryMock({
            findMessageForReportAccess: jest.fn().mockResolvedValue(
              messageRecord({
                status: CommunicationMessageStatus.DELETED,
                deletedAt: new Date('2026-05-02T08:00:00.000Z'),
              }),
            ),
          }),
        ).execute(MESSAGE_ID, { reason: 'spam' }),
      ),
    ).rejects.toBeInstanceOf(CommunicationMessageDeletedException);
  });

  it('creates report and audits mutation without unrelated side effects', async () => {
    let audit: CommunicationReportAuditInput | undefined;
    const repository = repositoryMock({
      createCurrentSchoolMessageReport: jest.fn().mockImplementation((input) => {
        const created = reportRecord({ reasonCode: 'safety' });
        audit = input.buildAuditEntry(created);
        return Promise.resolve(created);
      }),
    });

    const result = await withScope(() =>
      new CreateCommunicationMessageReportUseCase(repository).execute(
        MESSAGE_ID,
        {
          reason: 'safety',
          description: 'Unsafe message',
        },
      ),
    );

    expect(result).toMatchObject({
      id: REPORT_ID,
      reason: 'safety',
      messageId: MESSAGE_ID,
    });
    expect(repository.createCurrentSchoolMessageReport).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        reporterUserId: ACTOR_ID,
        reasonCode: 'safety',
      }),
    );
    expect(audit).toMatchObject({
      actorId: ACTOR_ID,
      userType: UserType.SCHOOL_USER,
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      module: 'communication',
      action: 'communication.message_report.create',
      resourceType: 'communication_message_report',
      resourceId: REPORT_ID,
      outcome: AuditOutcome.SUCCESS,
    });
    expect(repository.createModerationAction).not.toHaveBeenCalled();
    expect(repository.createAnnouncement).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
    expect(repository.enqueueJob).not.toHaveBeenCalled();
    expect(repository.emitRealtime).not.toHaveBeenCalled();
  });

  it('updates report status and audits mutation', async () => {
    let audit: CommunicationReportAuditInput | undefined;
    const repository = repositoryMock({
      updateCurrentSchoolMessageReport: jest.fn().mockImplementation((input) => {
        const updated = reportRecord({
          status: CommunicationReportStatus.RESOLVED,
          reviewedById: ACTOR_ID,
          reviewedAt: new Date('2026-05-02T09:00:00.000Z'),
        });
        audit = input.buildAuditEntry(updated);
        return Promise.resolve(updated);
      }),
    });

    const result = await withScope(() =>
      new UpdateCommunicationMessageReportUseCase(repository).execute(
        REPORT_ID,
        { status: 'resolved', note: 'Handled' },
      ),
    );

    expect(result).toMatchObject({
      status: 'resolved',
      reviewedById: ACTOR_ID,
    });
    expect(audit).toMatchObject({
      action: 'communication.message_report.update',
      before: expect.objectContaining({ targetSchoolId: SCHOOL_ID }),
      after: expect.objectContaining({ reportId: REPORT_ID }),
    });
  });
});

function repositoryMock(overrides?: Record<string, unknown>) {
  return {
    findMessageForReportAccess: jest.fn().mockResolvedValue(messageRecord()),
    findActiveParticipantForActor: jest.fn().mockResolvedValue(participantRecord()),
    findReporterMessageReport: jest.fn().mockResolvedValue(null),
    createCurrentSchoolMessageReport: jest.fn().mockResolvedValue(reportRecord()),
    listCurrentSchoolMessageReports: jest.fn().mockResolvedValue({
      items: [reportRecord()],
      total: 1,
      limit: 50,
      page: 1,
    }),
    findCurrentSchoolMessageReportById: jest.fn().mockResolvedValue(reportRecord()),
    updateCurrentSchoolMessageReport: jest.fn().mockResolvedValue(reportRecord()),
    createAuditLog: jest.fn(),
    createModerationAction: jest.fn(),
    createAnnouncement: jest.fn(),
    createNotification: jest.fn(),
    enqueueJob: jest.fn(),
    emitRealtime: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as CommunicationReportRepository & Record<string, jest.Mock>;
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
    hiddenAt: null,
    deletedAt: null,
    sentAt: now,
    conversation: {
      id: CONVERSATION_ID,
      schoolId: SCHOOL_ID,
      status: 'ACTIVE',
    },
    ...(overrides ?? {}),
  } as any;
}

function participantRecord() {
  return {
    id: 'participant-1',
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    userId: ACTOR_ID,
    role: 'MEMBER',
    status: 'ACTIVE',
    mutedUntil: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:00:00.000Z'),
  } as any;
}

function reportRecord(overrides?: Record<string, unknown>) {
  const now = new Date('2026-05-02T08:00:00.000Z');
  return {
    id: REPORT_ID,
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    reporterUserId: ACTOR_ID,
    status: CommunicationReportStatus.OPEN,
    reasonCode: 'spam',
    reasonText: 'Report text',
    reviewedById: null,
    reviewedAt: null,
    resolutionNote: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    message: {
      id: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      senderUserId: 'sender-1',
      kind: CommunicationMessageKind.TEXT,
      status: CommunicationMessageStatus.SENT,
      hiddenAt: null,
      deletedAt: null,
      sentAt: now,
    },
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
      permissions: ['communication.messages.report'],
    },
  };

  return runWithRequestContext(context, fn);
}

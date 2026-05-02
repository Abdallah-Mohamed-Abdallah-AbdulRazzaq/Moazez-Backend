import { CommunicationMessageStatus } from '@prisma/client';
import {
  CommunicationMessageDeletedException,
  CommunicationMessageHiddenException,
} from '../domain/communication-message-domain';
import { CommunicationConversationNotMemberException } from '../domain/communication-participant-domain';
import {
  assertCanCreateReport,
  assertCanUpdateReport,
  CommunicationReportDuplicateException,
  CommunicationReportInvalidStatusException,
  normalizeCommunicationReportReason,
  normalizeCommunicationReportStatus,
} from '../domain/communication-report-domain';

describe('communication report domain', () => {
  it('normalizes lowercase reason and status values to storage values', () => {
    expect(normalizeCommunicationReportReason('inappropriate-content')).toBe(
      'inappropriate_content',
    );
    expect(normalizeCommunicationReportStatus('pending')).toBe('OPEN');
    expect(normalizeCommunicationReportStatus('in_review')).toBe('IN_REVIEW');
    expect(normalizeCommunicationReportStatus('DISMISSED')).toBe('DISMISSED');
  });

  it('rejects hidden deleted duplicate and non-participant report attempts', () => {
    expect(() =>
      assertCanCreateReport({
        message: messagePlain({ status: CommunicationMessageStatus.HIDDEN }),
        participant: participantPlain(),
        hasDuplicateOpenReport: false,
        canReportWithoutParticipant: false,
      }),
    ).toThrow(CommunicationMessageHiddenException);

    expect(() =>
      assertCanCreateReport({
        message: messagePlain({ status: CommunicationMessageStatus.DELETED }),
        participant: participantPlain(),
        hasDuplicateOpenReport: false,
        canReportWithoutParticipant: false,
      }),
    ).toThrow(CommunicationMessageDeletedException);

    expect(() =>
      assertCanCreateReport({
        message: messagePlain(),
        participant: participantPlain(),
        hasDuplicateOpenReport: true,
        canReportWithoutParticipant: false,
      }),
    ).toThrow(CommunicationReportDuplicateException);

    expect(() =>
      assertCanCreateReport({
        message: messagePlain(),
        participant: null,
        hasDuplicateOpenReport: false,
        canReportWithoutParticipant: false,
      }),
    ).toThrow(CommunicationConversationNotMemberException);
  });

  it('allows safe admin reporting without participant and blocks terminal reopen', () => {
    expect(() =>
      assertCanCreateReport({
        message: messagePlain(),
        participant: null,
        hasDuplicateOpenReport: false,
        canReportWithoutParticipant: true,
      }),
    ).not.toThrow();

    expect(() =>
      assertCanUpdateReport({
        report: { id: 'report-1', status: 'RESOLVED' },
        status: 'IN_REVIEW',
      }),
    ).toThrow(CommunicationReportInvalidStatusException);
  });
});

function messagePlain(overrides?: Record<string, unknown>) {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderUserId: 'sender-1',
    status: CommunicationMessageStatus.SENT,
    hiddenAt: null,
    deletedAt: null,
    ...(overrides ?? {}),
  } as any;
}

function participantPlain(overrides?: Record<string, unknown>) {
  return {
    id: 'participant-1',
    conversationId: 'conversation-1',
    userId: 'actor-1',
    status: 'ACTIVE',
    ...(overrides ?? {}),
  } as any;
}

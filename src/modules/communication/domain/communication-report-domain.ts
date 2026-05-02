import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationMessageDeletedException,
  CommunicationMessageHiddenException,
} from './communication-message-domain';
import { CommunicationConversationNotMemberException } from './communication-participant-domain';
import { CommunicationConversationScopeInvalidException } from './communication-conversation-domain';

export type CommunicationReportStatusValue =
  | 'OPEN'
  | 'IN_REVIEW'
  | 'RESOLVED'
  | 'DISMISSED';

export type CommunicationReportReasonValue =
  | 'spam'
  | 'harassment'
  | 'bullying'
  | 'abusive_language'
  | 'inappropriate_content'
  | 'safety'
  | 'privacy'
  | 'other';

export interface PlainReportMessage {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  status: 'SENT' | 'HIDDEN' | 'DELETED';
  hiddenAt?: Date | null;
  deletedAt?: Date | null;
}

export interface PlainReportParticipant {
  id: string;
  conversationId: string;
  userId: string;
  status: 'ACTIVE' | 'INVITED' | 'LEFT' | 'REMOVED' | 'MUTED' | 'BLOCKED';
}

export interface PlainCommunicationMessageReport {
  id: string;
  status: CommunicationReportStatusValue;
}

export const COMMUNICATION_REPORT_REASONS: CommunicationReportReasonValue[] = [
  'spam',
  'harassment',
  'bullying',
  'abusive_language',
  'inappropriate_content',
  'safety',
  'privacy',
  'other',
];

export const COMMUNICATION_REPORT_STATUSES = [
  'open',
  'pending',
  'in_review',
  'resolved',
  'dismissed',
] as const;

const REPORT_STATUS_MAP: Record<string, CommunicationReportStatusValue> = {
  open: 'OPEN',
  pending: 'OPEN',
  in_review: 'IN_REVIEW',
  resolved: 'RESOLVED',
  dismissed: 'DISMISSED',
};

const REPORT_REASONS = new Set<string>(COMMUNICATION_REPORT_REASONS);
const ACTIVE_PARTICIPANT_STATUSES = new Set(['ACTIVE', 'MUTED']);

export class CommunicationReportDuplicateException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.report.duplicate',
      message: 'Message report already exists',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CommunicationReportInvalidStatusException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.report.invalid_status',
      message: 'Report status transition is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function normalizeCommunicationReportReason(
  value: string,
): CommunicationReportReasonValue {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!REPORT_REASONS.has(normalized)) {
    throw new CommunicationConversationScopeInvalidException(
      'Report reason is invalid',
      { field: 'reason', value },
    );
  }

  return normalized as CommunicationReportReasonValue;
}

export function normalizeCommunicationReportStatus(
  value: string,
): CommunicationReportStatusValue {
  const normalized = value.trim().toLowerCase();
  const mapped = REPORT_STATUS_MAP[normalized];
  if (!mapped) {
    throw new CommunicationReportInvalidStatusException({
      field: 'status',
      value,
    });
  }

  return mapped;
}

export function assertCanCreateReport(params: {
  message: PlainReportMessage;
  participant?: PlainReportParticipant | null;
  hasDuplicateOpenReport: boolean;
  canReportWithoutParticipant: boolean;
}): void {
  if (params.message.status === 'DELETED' || params.message.deletedAt) {
    throw new CommunicationMessageDeletedException({
      messageId: params.message.id,
    });
  }

  if (params.message.status === 'HIDDEN' || params.message.hiddenAt) {
    throw new CommunicationMessageHiddenException({
      messageId: params.message.id,
    });
  }

  if (params.hasDuplicateOpenReport) {
    throw new CommunicationReportDuplicateException({
      messageId: params.message.id,
    });
  }

  if (params.canReportWithoutParticipant) return;

  if (!params.participant) {
    throw new CommunicationConversationNotMemberException({
      conversationId: params.message.conversationId,
    });
  }

  if (!ACTIVE_PARTICIPANT_STATUSES.has(params.participant.status)) {
    throw new CommunicationConversationNotMemberException({
      conversationId: params.participant.conversationId,
      participantId: params.participant.id,
      status: params.participant.status,
    });
  }
}

export function assertCanUpdateReport(params: {
  report: PlainCommunicationMessageReport;
  status: CommunicationReportStatusValue;
}): void {
  const terminalStatuses = new Set<CommunicationReportStatusValue>([
    'RESOLVED',
    'DISMISSED',
  ]);

  if (
    terminalStatuses.has(params.report.status) &&
    !terminalStatuses.has(params.status)
  ) {
    throw new CommunicationReportInvalidStatusException({
      reportId: params.report.id,
      currentStatus: params.report.status,
      requestedStatus: params.status,
    });
  }
}

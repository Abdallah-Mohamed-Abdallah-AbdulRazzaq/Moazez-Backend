import { Injectable } from '@nestjs/common';
import { AuditOutcome, CommunicationReportStatus } from '@prisma/client';
import { getRequestContext } from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationScope,
  requireCommunicationScope,
} from '../communication-context';
import {
  assertCanCreateReport,
  assertCanUpdateReport,
  normalizeCommunicationReportReason,
  normalizeCommunicationReportStatus,
  PlainCommunicationMessageReport,
  PlainReportMessage,
  PlainReportParticipant,
} from '../domain/communication-report-domain';
import {
  CreateCommunicationMessageReportDto,
  ListCommunicationMessageReportsQueryDto,
  UpdateCommunicationMessageReportDto,
} from '../dto/communication-report.dto';
import {
  CommunicationMessageReportRecord,
  CommunicationReportAuditInput,
  CommunicationReportMessageAccessRecord,
  CommunicationReportParticipantRecord,
  CommunicationReportRepository,
} from '../infrastructure/communication-report.repository';
import {
  presentCommunicationMessageReport,
  presentCommunicationMessageReportList,
  summarizeCommunicationReportForAudit,
} from '../presenters/communication-report.presenter';

@Injectable()
export class CreateCommunicationMessageReportUseCase {
  constructor(
    private readonly communicationReportRepository: CommunicationReportRepository,
  ) {}

  async execute(
    messageId: string,
    command: CreateCommunicationMessageReportDto,
  ) {
    const scope = requireCommunicationScope();
    const message = await requireMessageForReport(
      this.communicationReportRepository,
      messageId,
    );
    const [participant, existingReport] = await Promise.all([
      this.communicationReportRepository.findActiveParticipantForActor({
        conversationId: message.conversationId,
        actorId: scope.actorId,
      }),
      this.communicationReportRepository.findReporterMessageReport({
        messageId: message.id,
        reporterUserId: scope.actorId,
      }),
    ]);
    const reasonCode = normalizeCommunicationReportReason(command.reason);

    assertCanCreateReport({
      message: toPlainMessage(message),
      participant: participant ? toPlainParticipant(participant) : null,
      hasDuplicateOpenReport: Boolean(existingReport),
      canReportWithoutParticipant: canReportWithoutParticipant(),
    });

    const report =
      await this.communicationReportRepository.createCurrentSchoolMessageReport({
        schoolId: scope.schoolId,
        conversationId: message.conversationId,
        messageId: message.id,
        reporterUserId: scope.actorId,
        reasonCode,
        reasonText: command.description ?? command.comment ?? null,
        metadata: command.metadata ?? null,
        buildAuditEntry: (created) =>
          buildReportAuditEntry({
            scope,
            action: 'communication.message_report.create',
            report: created,
            changedFields: ['reasonCode', 'reasonText', 'metadata'],
          }),
      });

    return presentCommunicationMessageReport(report);
  }
}

@Injectable()
export class ListCommunicationMessageReportsUseCase {
  constructor(
    private readonly communicationReportRepository: CommunicationReportRepository,
  ) {}

  async execute(query: ListCommunicationMessageReportsQueryDto) {
    requireCommunicationScope();

    const result =
      await this.communicationReportRepository.listCurrentSchoolMessageReports({
        ...(query.status
          ? {
              status: normalizeCommunicationReportStatus(
                query.status,
              ) as CommunicationReportStatus,
            }
          : {}),
        ...(query.reason
          ? { reasonCode: normalizeCommunicationReportReason(query.reason) }
          : {}),
        ...(query.conversationId
          ? { conversationId: query.conversationId }
          : {}),
        ...(query.messageId ? { messageId: query.messageId } : {}),
        ...(query.reporterId ? { reporterUserId: query.reporterId } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.page !== undefined ? { page: query.page } : {}),
      });

    return presentCommunicationMessageReportList(result);
  }
}

@Injectable()
export class GetCommunicationMessageReportUseCase {
  constructor(
    private readonly communicationReportRepository: CommunicationReportRepository,
  ) {}

  async execute(reportId: string) {
    requireCommunicationScope();
    const report = await requireReport(
      this.communicationReportRepository,
      reportId,
    );

    return presentCommunicationMessageReport(report);
  }
}

@Injectable()
export class UpdateCommunicationMessageReportUseCase {
  constructor(
    private readonly communicationReportRepository: CommunicationReportRepository,
  ) {}

  async execute(
    reportId: string,
    command: UpdateCommunicationMessageReportDto,
  ) {
    const scope = requireCommunicationScope();
    const report = await requireReport(
      this.communicationReportRepository,
      reportId,
    );
    const status = normalizeCommunicationReportStatus(
      command.status,
    ) as CommunicationReportStatus;

    assertCanUpdateReport({
      report: toPlainReport(report),
      status,
    });

    const updated =
      await this.communicationReportRepository.updateCurrentSchoolMessageReport({
        reportId: report.id,
        status,
        reviewedById: scope.actorId,
        resolutionNote: command.resolutionNote ?? command.note ?? undefined,
        metadata: command.metadata,
        buildAuditEntry: (next) =>
          buildReportAuditEntry({
            scope,
            action: 'communication.message_report.update',
            report: next,
            before: report,
            changedFields: ['status', 'reviewedById', 'reviewedAt', 'resolutionNote', 'metadata'],
          }),
      });

    return presentCommunicationMessageReport(updated);
  }
}

async function requireMessageForReport(
  repository: CommunicationReportRepository,
  messageId: string,
): Promise<CommunicationReportMessageAccessRecord> {
  const message = await repository.findMessageForReportAccess(messageId);
  if (!message) {
    throw new NotFoundDomainException('Message not found', { messageId });
  }

  return message;
}

async function requireReport(
  repository: CommunicationReportRepository,
  reportId: string,
): Promise<CommunicationMessageReportRecord> {
  const report = await repository.findCurrentSchoolMessageReportById(reportId);
  if (!report) {
    throw new NotFoundDomainException('Message report not found', { reportId });
  }

  return report;
}

function canReportWithoutParticipant(): boolean {
  return hasAnyPermission(
    'communication.messages.moderate',
    'communication.admin.manage',
  );
}

function hasAnyPermission(...permissions: string[]): boolean {
  const ctx = getRequestContext();
  const granted = new Set(ctx?.activeMembership?.permissions ?? []);
  return permissions.some((permission) => granted.has(permission));
}

function toPlainMessage(
  message: CommunicationReportMessageAccessRecord,
): PlainReportMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderUserId: message.senderUserId,
    status: message.status,
    hiddenAt: message.hiddenAt,
    deletedAt: message.deletedAt,
  };
}

function toPlainParticipant(
  participant: CommunicationReportParticipantRecord,
): PlainReportParticipant {
  return {
    id: participant.id,
    conversationId: participant.conversationId,
    userId: participant.userId,
    status: participant.status,
  };
}

function toPlainReport(
  report: CommunicationMessageReportRecord,
): PlainCommunicationMessageReport {
  return {
    id: report.id,
    status: report.status,
  };
}

function buildReportAuditEntry(params: {
  scope: CommunicationScope;
  action:
    | 'communication.message_report.create'
    | 'communication.message_report.update';
  report: CommunicationMessageReportRecord;
  before?: CommunicationMessageReportRecord | null;
  changedFields: string[];
}): CommunicationReportAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: params.action,
    resourceType: 'communication_message_report',
    resourceId: params.report.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? {
          targetSchoolId: params.scope.schoolId,
          report: summarizeCommunicationReportForAudit(params.before),
        }
      : undefined,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      conversationId: params.report.conversationId,
      messageId: params.report.messageId,
      reportId: params.report.id,
      targetUserId: params.report.message.senderUserId,
      report: summarizeCommunicationReportForAudit(params.report),
    },
  };
}

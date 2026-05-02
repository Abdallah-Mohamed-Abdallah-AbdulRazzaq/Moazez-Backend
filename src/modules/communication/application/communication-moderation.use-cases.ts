import { Injectable, Optional } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationMessageStatus,
  CommunicationModerationActionType,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationScope,
  requireCommunicationScope,
} from '../communication-context';
import {
  assertCanCreateModerationAction,
  normalizeCommunicationModerationAction,
  PlainModerationMessage,
} from '../domain/communication-moderation-domain';
import { CreateCommunicationModerationActionDto } from '../dto/communication-moderation.dto';
import {
  CommunicationMessageModerationUpdate,
  CommunicationModerationActionListResult,
  CommunicationModerationAuditInput,
  CommunicationModerationMessageRecord,
  CommunicationModerationMutationResult,
  CommunicationModerationRepository,
} from '../infrastructure/communication-moderation.repository';
import {
  presentCommunicationModerationActionList,
  presentCommunicationModerationMutation,
  summarizeCommunicationModerationActionForAudit,
} from '../presenters/communication-moderation.presenter';
import { CommunicationRealtimeEventsService } from './communication-realtime-events.service';

@Injectable()
export class ListCommunicationModerationActionsUseCase {
  constructor(
    private readonly communicationModerationRepository: CommunicationModerationRepository,
  ) {}

  async execute(messageId: string) {
    const message = await requireMessageForModeration(
      this.communicationModerationRepository,
      messageId,
    );
    requireCommunicationScope();

    const result: CommunicationModerationActionListResult =
      await this.communicationModerationRepository.listCurrentSchoolModerationActionsForMessage(
        {
          messageId: message.id,
        },
      );

    return presentCommunicationModerationActionList(result);
  }
}

@Injectable()
export class CreateCommunicationModerationActionUseCase {
  constructor(
    private readonly communicationModerationRepository: CommunicationModerationRepository,
    @Optional()
    private readonly realtimeEvents?: CommunicationRealtimeEventsService,
  ) {}

  async execute(
    messageId: string,
    command: CreateCommunicationModerationActionDto,
  ) {
    const scope = requireCommunicationScope();
    const message = await requireMessageForModeration(
      this.communicationModerationRepository,
      messageId,
    );
    const normalizedAction = normalizeCommunicationModerationAction(
      command.action,
    );
    const actionType = normalizedAction as CommunicationModerationActionType;

    assertCanCreateModerationAction({
      action: normalizedAction,
      message: toPlainMessage(message),
    });

    const result =
      await this.communicationModerationRepository.createCurrentSchoolMessageModerationAction(
        {
          schoolId: scope.schoolId,
          conversationId: message.conversationId,
          messageId: message.id,
          targetUserId:
            actionType === CommunicationModerationActionType.USER_RESTRICTED
              ? message.senderUserId
              : message.senderUserId,
          actorUserId: scope.actorId,
          actionType,
          reason: command.reason ?? command.note ?? null,
          metadata: command.metadata ?? null,
          messageUpdate: buildMessageUpdateForAction({
            actionType,
            actorId: scope.actorId,
            reason: command.reason ?? command.note ?? null,
          }),
          buildAuditEntry: (next) =>
            buildModerationAuditEntry({
              scope,
              result: next,
              changedFields: changedFieldsForAction(actionType),
            }),
        },
      );

    this.realtimeEvents?.publishModerationMessageStateChange({
      schoolId: scope.schoolId,
      actionType,
      message: result.message,
    });

    return presentCommunicationModerationMutation(result);
  }
}

async function requireMessageForModeration(
  repository: CommunicationModerationRepository,
  messageId: string,
): Promise<CommunicationModerationMessageRecord> {
  const message = await repository.findMessageForModeration(messageId);
  if (!message) {
    throw new NotFoundDomainException('Message not found', { messageId });
  }

  return message;
}

function buildMessageUpdateForAction(params: {
  actionType: CommunicationModerationActionType;
  actorId: string;
  reason?: string | null;
}): CommunicationMessageModerationUpdate | undefined {
  const now = new Date();

  switch (params.actionType) {
    case CommunicationModerationActionType.MESSAGE_HIDDEN:
      return {
        status: CommunicationMessageStatus.HIDDEN,
        hiddenById: params.actorId,
        hiddenAt: now,
        hiddenReason: normalizeOptionalText(params.reason),
      };
    case CommunicationModerationActionType.MESSAGE_UNHIDDEN:
      return {
        status: CommunicationMessageStatus.SENT,
        hiddenById: null,
        hiddenAt: null,
        hiddenReason: null,
      };
    case CommunicationModerationActionType.MESSAGE_DELETED:
      return {
        status: CommunicationMessageStatus.DELETED,
        deletedById: params.actorId,
        deletedAt: now,
      };
    default:
      return undefined;
  }
}

function changedFieldsForAction(
  actionType: CommunicationModerationActionType,
): string[] {
  switch (actionType) {
    case CommunicationModerationActionType.MESSAGE_HIDDEN:
      return ['status', 'hiddenById', 'hiddenAt', 'hiddenReason'];
    case CommunicationModerationActionType.MESSAGE_UNHIDDEN:
      return ['status', 'hiddenById', 'hiddenAt', 'hiddenReason'];
    case CommunicationModerationActionType.MESSAGE_DELETED:
      return ['status', 'deletedById', 'deletedAt'];
    default:
      return ['actionType', 'reason', 'metadata'];
  }
}

function toPlainMessage(
  message: CommunicationModerationMessageRecord,
): PlainModerationMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderUserId: message.senderUserId,
    status: message.status,
    hiddenAt: message.hiddenAt,
    deletedAt: message.deletedAt,
  };
}

function buildModerationAuditEntry(params: {
  scope: CommunicationScope;
  result: CommunicationModerationMutationResult;
  changedFields: string[];
}): CommunicationModerationAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: 'communication.moderation_action.create',
    resourceType: 'communication_moderation_action',
    resourceId: params.result.action.id,
    outcome: AuditOutcome.SUCCESS,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      conversationId: params.result.action.conversationId,
      messageId: params.result.action.messageId,
      moderationActionId: params.result.action.id,
      targetUserId: params.result.action.targetUserId,
      moderationAction: summarizeCommunicationModerationActionForAudit(
        params.result,
      ),
    },
  };
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

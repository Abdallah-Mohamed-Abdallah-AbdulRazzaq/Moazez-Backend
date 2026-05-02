import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationConversationStatus,
  CommunicationConversationType,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationScope,
  requireCommunicationScope,
} from '../communication-context';
import {
  assertConversationCanBeArchived,
  assertConversationCanBeClosed,
  assertConversationCanBeReopened,
  assertConversationCreateAllowedByPolicy,
  assertConversationCreatePayload,
  assertConversationMetadataPatch,
  buildConversationSearchFilters,
  CommunicationConversationStatusValue,
  hasOwn,
  mergeConversationMetadata,
  normalizeCommunicationConversationStatus,
  normalizeCommunicationConversationType,
  normalizeNullableText,
} from '../domain/communication-conversation-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import {
  CreateCommunicationConversationDto,
  ListCommunicationConversationsQueryDto,
  UpdateCommunicationConversationDto,
} from '../dto/communication-conversation.dto';
import {
  CommunicationConversationAuditInput,
  CommunicationConversationRecord,
  CommunicationConversationRepository,
  CommunicationConversationUpdateData,
} from '../infrastructure/communication-conversation.repository';
import { CommunicationPolicyRepository } from '../infrastructure/communication-policy.repository';
import {
  presentCommunicationConversation,
  presentCommunicationConversationList,
  summarizeCommunicationConversationForAudit,
} from '../presenters/communication-conversation.presenter';

@Injectable()
export class ListCommunicationConversationsUseCase {
  constructor(
    private readonly communicationConversationRepository: CommunicationConversationRepository,
  ) {}

  async execute(query: ListCommunicationConversationsQueryDto) {
    requireCommunicationScope();
    const filters = {
      ...(query.type
        ? {
            type: normalizeCommunicationConversationType(
              query.type,
            ) as CommunicationConversationType,
          }
        : {}),
      ...(query.status
        ? {
            status: normalizeCommunicationConversationStatus(
              query.status,
            ) as CommunicationConversationStatus,
          }
        : {}),
      ...buildConversationSearchFilters(query.search),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.page !== undefined ? { page: query.page } : {}),
    };

    const result =
      await this.communicationConversationRepository.listCurrentSchoolConversations(
        filters,
      );

    return presentCommunicationConversationList(result);
  }
}

@Injectable()
export class CreateCommunicationConversationUseCase {
  constructor(
    private readonly communicationConversationRepository: CommunicationConversationRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(command: CreateCommunicationConversationDto) {
    const scope = requireCommunicationScope();
    const policy =
      await this.communicationPolicyRepository.findCurrentSchoolPolicy();
    assertConversationCreateAllowedByPolicy(
      policy ?? buildDefaultCommunicationPolicy(),
    );

    const normalizedType = normalizeCommunicationConversationType(command.type);
    const type = normalizedType as CommunicationConversationType;
    assertConversationCreatePayload({
      type: normalizedType,
      title: command.title,
      description: command.description,
      academicYearId: command.academicYearId,
      termId: command.termId,
      stageId: command.stageId,
      gradeId: command.gradeId,
      sectionId: command.sectionId,
      classroomId: command.classroomId,
      subjectId: command.subjectId,
      metadata: command.metadata,
    });
    await validateConversationContextReferences({
      repository: this.communicationConversationRepository,
      command,
    });

    const metadata = mergeConversationMetadata(null, {
      metadata: command.metadata,
      isReadOnly: command.isReadOnly,
      isPinned: command.isPinned,
    });

    const conversation =
      await this.communicationConversationRepository.createCurrentSchoolConversation(
        {
          schoolId: scope.schoolId,
          actorId: scope.actorId,
          data: {
            type,
            status: CommunicationConversationStatus.ACTIVE,
            titleEn: normalizeNullableText(command.title),
            descriptionEn: normalizeNullableText(command.description),
            avatarFileId: command.avatarFileId ?? null,
            academicYearId: command.academicYearId ?? null,
            termId: command.termId ?? null,
            stageId: command.stageId ?? null,
            gradeId: command.gradeId ?? null,
            sectionId: command.sectionId ?? null,
            classroomId: command.classroomId ?? null,
            subjectId: command.subjectId ?? null,
            createdById: scope.actorId,
            metadata,
          },
          buildAuditEntry: (created) =>
            buildCommunicationConversationAuditEntry({
              scope,
              action: 'communication.conversation.create',
              conversation: created,
              changedFields: [
                'type',
                'title',
                'description',
                'avatarFileId',
                'metadata',
              ],
            }),
        },
      );

    return presentCommunicationConversation(conversation);
  }
}

@Injectable()
export class GetCommunicationConversationUseCase {
  constructor(
    private readonly communicationConversationRepository: CommunicationConversationRepository,
  ) {}

  async execute(conversationId: string) {
    requireCommunicationScope();
    const conversation = await requireConversation(
      this.communicationConversationRepository,
      conversationId,
    );
    const participantSummary =
      await this.communicationConversationRepository.countConversationParticipants(
        conversation.id,
      );

    return presentCommunicationConversation(conversation, {
      participantSummary,
    });
  }
}

@Injectable()
export class UpdateCommunicationConversationUseCase {
  constructor(
    private readonly communicationConversationRepository: CommunicationConversationRepository,
  ) {}

  async execute(
    conversationId: string,
    command: UpdateCommunicationConversationDto,
  ) {
    const scope = requireCommunicationScope();
    const existing = await requireConversation(
      this.communicationConversationRepository,
      conversationId,
    );
    assertConversationMetadataPatch({
      status: existing.status as CommunicationConversationStatusValue,
      patch: command,
    });

    const data = buildConversationMetadataUpdateData(existing, command);
    const changedFields = buildPatchChangedFields(command);
    const updated =
      await this.communicationConversationRepository.updateCurrentSchoolConversation(
        {
          conversationId: existing.id,
          data,
          buildAuditEntry: (conversation) =>
            buildCommunicationConversationAuditEntry({
              scope,
              action: 'communication.conversation.update',
              conversation,
              before: existing,
              changedFields,
            }),
        },
      );

    return presentCommunicationConversation(updated);
  }
}

@Injectable()
export class ArchiveCommunicationConversationUseCase {
  constructor(
    private readonly communicationConversationRepository: CommunicationConversationRepository,
  ) {}

  async execute(conversationId: string) {
    const scope = requireCommunicationScope();
    const existing = await requireConversation(
      this.communicationConversationRepository,
      conversationId,
    );
    assertConversationCanBeArchived(
      existing.status as CommunicationConversationStatusValue,
    );

    const archived =
      await this.communicationConversationRepository.archiveCurrentSchoolConversation(
        {
          conversationId: existing.id,
          actorId: scope.actorId,
          buildAuditEntry: (conversation) =>
            buildCommunicationConversationAuditEntry({
              scope,
              action: 'communication.conversation.archive',
              conversation,
              before: existing,
              changedFields: ['status', 'archivedAt', 'archivedById'],
            }),
        },
      );

    return presentCommunicationConversation(archived);
  }
}

@Injectable()
export class CloseCommunicationConversationUseCase {
  constructor(
    private readonly communicationConversationRepository: CommunicationConversationRepository,
  ) {}

  async execute(conversationId: string) {
    const scope = requireCommunicationScope();
    const existing = await requireConversation(
      this.communicationConversationRepository,
      conversationId,
    );
    assertConversationCanBeClosed(
      existing.status as CommunicationConversationStatusValue,
    );

    const closed =
      await this.communicationConversationRepository.closeCurrentSchoolConversation(
        {
          conversationId: existing.id,
          actorId: scope.actorId,
          buildAuditEntry: (conversation) =>
            buildCommunicationConversationAuditEntry({
              scope,
              action: 'communication.conversation.close',
              conversation,
              before: existing,
              changedFields: ['status', 'closedAt', 'closedById'],
            }),
        },
      );

    return presentCommunicationConversation(closed);
  }
}

@Injectable()
export class ReopenCommunicationConversationUseCase {
  constructor(
    private readonly communicationConversationRepository: CommunicationConversationRepository,
  ) {}

  async execute(conversationId: string) {
    const scope = requireCommunicationScope();
    const existing = await requireConversation(
      this.communicationConversationRepository,
      conversationId,
    );
    assertConversationCanBeReopened(
      existing.status as CommunicationConversationStatusValue,
    );

    const reopened =
      await this.communicationConversationRepository.reopenCurrentSchoolConversation(
        {
          conversationId: existing.id,
          buildAuditEntry: (conversation) =>
            buildCommunicationConversationAuditEntry({
              scope,
              action: 'communication.conversation.reopen',
              conversation,
              before: existing,
              changedFields: [
                'status',
                'archivedAt',
                'archivedById',
                'closedAt',
                'closedById',
              ],
            }),
        },
      );

    return presentCommunicationConversation(reopened);
  }
}

async function requireConversation(
  repository: CommunicationConversationRepository,
  conversationId: string,
): Promise<CommunicationConversationRecord> {
  const conversation =
    await repository.findCurrentSchoolConversationById(conversationId);
  if (!conversation) {
    throw new NotFoundDomainException('Conversation not found', {
      conversationId,
    });
  }

  return conversation;
}

async function validateConversationContextReferences(params: {
  repository: CommunicationConversationRepository;
  command: CreateCommunicationConversationDto;
}): Promise<void> {
  if (params.command.academicYearId) {
    await requireContextResource(
      'Academic year',
      'academicYearId',
      params.command.academicYearId,
      params.repository.findAcademicYear(params.command.academicYearId),
    );
  }

  const term = params.command.termId
    ? await requireContextResource(
        'Term',
        'termId',
        params.command.termId,
        params.repository.findTerm(params.command.termId),
      )
    : null;

  if (
    term &&
    params.command.academicYearId &&
    term.academicYearId !== params.command.academicYearId
  ) {
    throw new NotFoundDomainException('Term not found', {
      termId: params.command.termId,
    });
  }

  if (params.command.stageId) {
    await requireContextResource(
      'Stage',
      'stageId',
      params.command.stageId,
      params.repository.findStage(params.command.stageId),
    );
  }
  if (params.command.gradeId) {
    await requireContextResource(
      'Grade',
      'gradeId',
      params.command.gradeId,
      params.repository.findGrade(params.command.gradeId),
    );
  }
  if (params.command.sectionId) {
    await requireContextResource(
      'Section',
      'sectionId',
      params.command.sectionId,
      params.repository.findSection(params.command.sectionId),
    );
  }
  if (params.command.classroomId) {
    await requireContextResource(
      'Classroom',
      'classroomId',
      params.command.classroomId,
      params.repository.findClassroom(params.command.classroomId),
    );
  }
  if (params.command.subjectId) {
    await requireContextResource(
      'Subject',
      'subjectId',
      params.command.subjectId,
      params.repository.findSubject(params.command.subjectId),
    );
  }
}

async function requireContextResource<T>(
  label: string,
  field: string,
  value: string,
  promise: Promise<T | null>,
): Promise<T> {
  const result = await promise;
  if (!result) {
    throw new NotFoundDomainException(`${label} not found`, {
      [field]: value,
    });
  }

  return result;
}

function buildConversationMetadataUpdateData(
  existing: CommunicationConversationRecord,
  command: UpdateCommunicationConversationDto,
): CommunicationConversationUpdateData {
  const data: CommunicationConversationUpdateData = {};

  if (hasOwn(command, 'title')) {
    data.titleEn = normalizeNullableText(command.title);
  }
  if (hasOwn(command, 'description')) {
    data.descriptionEn = normalizeNullableText(command.description);
  }
  if (hasOwn(command, 'avatarFileId')) {
    data.avatarFileId = command.avatarFileId ?? null;
  }
  if (
    hasOwn(command, 'metadata') ||
    hasOwn(command, 'isReadOnly') ||
    hasOwn(command, 'isPinned')
  ) {
    data.metadata = mergeConversationMetadata(asPlainMetadata(existing.metadata), {
      metadata: command.metadata,
      isReadOnly: command.isReadOnly,
      isPinned: command.isPinned,
    });
  }

  return data;
}

function buildPatchChangedFields(
  command: UpdateCommunicationConversationDto,
): string[] {
  const fields: string[] = [];
  if (hasOwn(command, 'title')) fields.push('title');
  if (hasOwn(command, 'description')) fields.push('description');
  if (hasOwn(command, 'avatarFileId')) fields.push('avatarFileId');
  if (hasOwn(command, 'isReadOnly')) fields.push('isReadOnly');
  if (hasOwn(command, 'isPinned')) fields.push('isPinned');
  if (hasOwn(command, 'metadata')) fields.push('metadata');
  return fields;
}

function buildCommunicationConversationAuditEntry(params: {
  scope: CommunicationScope;
  action:
    | 'communication.conversation.create'
    | 'communication.conversation.update'
    | 'communication.conversation.archive'
    | 'communication.conversation.close'
    | 'communication.conversation.reopen';
  conversation: CommunicationConversationRecord;
  before?: CommunicationConversationRecord | null;
  changedFields: string[];
}): CommunicationConversationAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: params.action,
    resourceType: 'communication_conversation',
    resourceId: params.conversation.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? {
          targetSchoolId: params.scope.schoolId,
          conversation: summarizeCommunicationConversationForAudit(
            params.before,
          ),
        }
      : undefined,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      conversation: summarizeCommunicationConversationForAudit(
        params.conversation,
      ),
    },
  };
}

function asPlainMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { FilesNotFoundException } from '../../files/uploads/domain/file-upload.exceptions';
import {
  CommunicationScope,
  requireCommunicationScope,
} from '../communication-context';
import {
  assertCanArchiveAnnouncement,
  assertCanCancelAnnouncement,
  assertCanCreateAnnouncement,
  assertCanLinkAnnouncementAttachment,
  assertCanMarkAnnouncementRead,
  assertCanPublishAnnouncement,
  assertCanUpdateAnnouncement,
  CommunicationAnnouncementAudienceInput,
  CommunicationAnnouncementAudienceTypeValue,
  CommunicationAnnouncementInvalidException,
  CommunicationAnnouncementPriorityValue,
  CommunicationAnnouncementStatusValue,
  normalizeAnnouncementBody,
  normalizeAnnouncementTitle,
  normalizeCommunicationAnnouncementAudienceType,
  normalizeCommunicationAnnouncementPriority,
  normalizeCommunicationAnnouncementStatus,
  PlainCommunicationAnnouncement,
} from '../domain/communication-announcement-domain';
import {
  CommunicationAnnouncementAudienceRowDto,
  CreateCommunicationAnnouncementDto,
  LinkCommunicationAnnouncementAttachmentDto,
  ListCommunicationAnnouncementsQueryDto,
  UpdateCommunicationAnnouncementDto,
} from '../dto/communication-announcement.dto';
import {
  CommunicationAnnouncementAttachmentRecord,
  CommunicationAnnouncementAuditInput,
  CommunicationAnnouncementAudienceData,
  CommunicationAnnouncementDetailRecord,
  CommunicationAnnouncementRepository,
} from '../infrastructure/communication-announcement.repository';
import {
  presentCommunicationAnnouncement,
  presentCommunicationAnnouncementList,
  summarizeCommunicationAnnouncementForAudit,
} from '../presenters/communication-announcement.presenter';
import {
  presentCommunicationAnnouncementAttachment,
  presentCommunicationAnnouncementAttachmentList,
  summarizeCommunicationAnnouncementAttachmentForAudit,
} from '../presenters/communication-announcement-attachment.presenter';
import {
  presentCommunicationAnnouncementReadReceipt,
  presentCommunicationAnnouncementReadSummary,
} from '../presenters/communication-announcement-read.presenter';

@Injectable()
export class ListCommunicationAnnouncementsUseCase {
  constructor(
    private readonly communicationAnnouncementRepository: CommunicationAnnouncementRepository,
  ) {}

  async execute(query: ListCommunicationAnnouncementsQueryDto) {
    requireCommunicationScope();

    const result =
      await this.communicationAnnouncementRepository.listCurrentSchoolAnnouncements(
        {
          filters: {
            ...(query.status
              ? {
                  status: normalizeCommunicationAnnouncementStatus(
                    query.status,
                  ) as CommunicationAnnouncementStatus,
                }
              : {}),
            ...(query.priority
              ? {
                  priority: normalizeCommunicationAnnouncementPriority(
                    query.priority,
                  ) as CommunicationAnnouncementPriority,
                }
              : {}),
            ...(query.audienceType
              ? {
                  audienceType: normalizeCommunicationAnnouncementAudienceType(
                    query.audienceType,
                  ) as CommunicationAnnouncementAudienceType,
                }
              : {}),
            ...(query.search ? { search: query.search } : {}),
            ...(query.publishedFrom
              ? { publishedFrom: new Date(query.publishedFrom) }
              : {}),
            ...(query.publishedTo
              ? { publishedTo: new Date(query.publishedTo) }
              : {}),
            ...(query.createdById ? { createdById: query.createdById } : {}),
            ...(query.limit !== undefined ? { limit: query.limit } : {}),
            ...(query.page !== undefined ? { page: query.page } : {}),
          },
        },
      );

    return presentCommunicationAnnouncementList(result);
  }
}

@Injectable()
export class CreateCommunicationAnnouncementUseCase {
  constructor(
    private readonly communicationAnnouncementRepository: CommunicationAnnouncementRepository,
  ) {}

  async execute(command: CreateCommunicationAnnouncementDto) {
    const scope = requireCommunicationScope();
    const title = normalizeAnnouncementTitle(command.title);
    const body = normalizeAnnouncementBody(command.body);
    const status = normalizeCommunicationAnnouncementStatus(
      command.status ?? 'draft',
    ) as CommunicationAnnouncementStatus;
    const priority = normalizeCommunicationAnnouncementPriority(
      command.priority ?? 'normal',
    ) as CommunicationAnnouncementPriority;
    const audienceType = normalizeCommunicationAnnouncementAudienceType(
      command.audienceType ?? 'school',
    ) as CommunicationAnnouncementAudienceType;
    const scheduledAt = parseOptionalDate(command.scheduledAt);
    const expiresAt = parseOptionalDate(command.expiresAt);
    const audienceRows = normalizeAudienceRows(audienceType, command.audiences);

    assertCanCreateAnnouncement({
      status,
      title,
      body,
      audienceType,
      audienceRows,
      scheduledAt,
      expiresAt,
      metadata: command.metadata,
    });
    await assertAudienceTargetsExist(
      this.communicationAnnouncementRepository,
      audienceRows,
    );

    const announcement =
      await this.communicationAnnouncementRepository.createCurrentSchoolAnnouncement(
        {
          schoolId: scope.schoolId,
          data: {
            title,
            body,
            status,
            priority,
            audienceType,
            scheduledAt,
            expiresAt,
            createdById: scope.actorId,
            updatedById: scope.actorId,
            metadata: command.metadata ?? null,
          },
          audienceRows: audienceRows as CommunicationAnnouncementAudienceData[],
          buildAuditEntry: (created) =>
            buildCommunicationAnnouncementAuditEntry({
              scope,
              action: 'communication.announcement.create',
              announcement: created,
              changedFields: [
                'title',
                'body',
                'status',
                'priority',
                'audienceType',
                'scheduledAt',
                'expiresAt',
                'metadata',
              ],
            }),
        },
      );

    return presentCommunicationAnnouncement(announcement);
  }
}

@Injectable()
export class GetCommunicationAnnouncementUseCase {
  constructor(
    private readonly communicationAnnouncementRepository: CommunicationAnnouncementRepository,
  ) {}

  async execute(announcementId: string) {
    requireCommunicationScope();
    const announcement = await requireAnnouncement(
      this.communicationAnnouncementRepository,
      announcementId,
    );

    return presentCommunicationAnnouncement(announcement);
  }
}

@Injectable()
export class UpdateCommunicationAnnouncementUseCase {
  constructor(
    private readonly communicationAnnouncementRepository: CommunicationAnnouncementRepository,
  ) {}

  async execute(
    announcementId: string,
    command: UpdateCommunicationAnnouncementDto,
  ) {
    const scope = requireCommunicationScope();
    const announcement = await requireAnnouncement(
      this.communicationAnnouncementRepository,
      announcementId,
    );

    const title =
      command.title !== undefined
        ? normalizeAnnouncementTitle(command.title ?? '')
        : announcement.title;
    const body =
      command.body !== undefined
        ? normalizeAnnouncementBody(command.body ?? '')
        : announcement.body;
    const priority =
      command.priority !== undefined
        ? (normalizeCommunicationAnnouncementPriority(
            command.priority ?? '',
          ) as CommunicationAnnouncementPriority)
        : announcement.priority;
    const audienceType =
      command.audienceType !== undefined
        ? (normalizeCommunicationAnnouncementAudienceType(
            command.audienceType ?? '',
          ) as CommunicationAnnouncementAudienceType)
        : announcement.audienceType;
    const replaceAudience =
      command.audienceType !== undefined || command.audiences !== undefined;
    const audienceRows = replaceAudience
      ? normalizeAudienceRows(audienceType, command.audiences)
      : announcement.audiences.map((audience) => ({
          audienceType: audience.audienceType,
          stageId: audience.stageId,
          gradeId: audience.gradeId,
          sectionId: audience.sectionId,
          classroomId: audience.classroomId,
          studentId: audience.studentId,
          guardianId: audience.guardianId,
          userId: audience.userId,
        }));
    const scheduledAt =
      command.scheduledAt !== undefined
        ? parseOptionalDate(command.scheduledAt)
        : announcement.scheduledAt;
    const expiresAt =
      command.expiresAt !== undefined
        ? parseOptionalDate(command.expiresAt)
        : announcement.expiresAt;
    const metadata =
      command.metadata !== undefined
        ? (command.metadata ?? null)
        : asPlainMetadata(announcement.metadata);

    assertCanUpdateAnnouncement({
      announcement: toPlainAnnouncement(announcement),
      title,
      body,
      audienceType,
      audienceRows,
      scheduledAt,
      expiresAt,
      metadata,
    });
    if (replaceAudience) {
      await assertAudienceTargetsExist(
        this.communicationAnnouncementRepository,
        audienceRows,
      );
    }

    const updated =
      await this.communicationAnnouncementRepository.updateCurrentSchoolAnnouncement(
        {
          announcementId: announcement.id,
          data: {
            ...(command.title !== undefined ? { title } : {}),
            ...(command.body !== undefined ? { body } : {}),
            ...(command.priority !== undefined ? { priority } : {}),
            ...(command.audienceType !== undefined ? { audienceType } : {}),
            ...(command.scheduledAt !== undefined ? { scheduledAt } : {}),
            ...(command.expiresAt !== undefined ? { expiresAt } : {}),
            ...(command.metadata !== undefined ? { metadata } : {}),
            updatedById: scope.actorId,
          },
          ...(replaceAudience
            ? {
                replaceAudience: {
                  schoolId: scope.schoolId,
                  audienceRows:
                    audienceRows as CommunicationAnnouncementAudienceData[],
                },
              }
            : {}),
          buildAuditEntry: (next) =>
            buildCommunicationAnnouncementAuditEntry({
              scope,
              action: 'communication.announcement.update',
              announcement: next,
              before: announcement,
              changedFields: buildChangedFields(command, replaceAudience),
            }),
        },
      );

    return presentCommunicationAnnouncement(updated);
  }
}

@Injectable()
export class PublishCommunicationAnnouncementUseCase {
  constructor(
    private readonly communicationAnnouncementRepository: CommunicationAnnouncementRepository,
  ) {}

  async execute(announcementId: string) {
    const scope = requireCommunicationScope();
    const announcement = await requireAnnouncement(
      this.communicationAnnouncementRepository,
      announcementId,
    );
    assertCanPublishAnnouncement(toPlainAnnouncement(announcement));

    const publishedAt = new Date();
    const published =
      await this.communicationAnnouncementRepository.publishCurrentSchoolAnnouncement(
        {
          announcementId: announcement.id,
          actorId: scope.actorId,
          publishedAt,
          buildAuditEntry: (next) =>
            buildCommunicationAnnouncementAuditEntry({
              scope,
              action: 'communication.announcement.publish',
              announcement: next,
              before: announcement,
              changedFields: ['status', 'publishedAt', 'publishedById'],
            }),
        },
      );

    return presentCommunicationAnnouncement(published);
  }
}

@Injectable()
export class ArchiveCommunicationAnnouncementUseCase {
  constructor(
    private readonly communicationAnnouncementRepository: CommunicationAnnouncementRepository,
  ) {}

  async execute(announcementId: string) {
    const scope = requireCommunicationScope();
    const announcement = await requireAnnouncement(
      this.communicationAnnouncementRepository,
      announcementId,
    );
    assertCanArchiveAnnouncement(toPlainAnnouncement(announcement));

    const archived =
      await this.communicationAnnouncementRepository.archiveCurrentSchoolAnnouncement(
        {
          announcementId: announcement.id,
          actorId: scope.actorId,
          archivedAt: new Date(),
          buildAuditEntry: (next) =>
            buildCommunicationAnnouncementAuditEntry({
              scope,
              action: 'communication.announcement.archive',
              announcement: next,
              before: announcement,
              changedFields: ['status', 'archivedAt', 'archivedById'],
            }),
        },
      );

    return presentCommunicationAnnouncement(archived);
  }
}

@Injectable()
export class CancelCommunicationAnnouncementUseCase {
  constructor(
    private readonly communicationAnnouncementRepository: CommunicationAnnouncementRepository,
  ) {}

  async execute(announcementId: string) {
    const scope = requireCommunicationScope();
    const announcement = await requireAnnouncement(
      this.communicationAnnouncementRepository,
      announcementId,
    );
    assertCanCancelAnnouncement(toPlainAnnouncement(announcement));

    const cancelled =
      await this.communicationAnnouncementRepository.cancelCurrentSchoolAnnouncement(
        {
          announcementId: announcement.id,
          actorId: scope.actorId,
          buildAuditEntry: (next) =>
            buildCommunicationAnnouncementAuditEntry({
              scope,
              action: 'communication.announcement.cancel',
              announcement: next,
              before: announcement,
              changedFields: ['status'],
            }),
        },
      );

    return presentCommunicationAnnouncement(cancelled);
  }
}

@Injectable()
export class MarkCommunicationAnnouncementReadUseCase {
  constructor(
    private readonly communicationAnnouncementRepository: CommunicationAnnouncementRepository,
  ) {}

  async execute(announcementId: string) {
    const scope = requireCommunicationScope();
    const announcement = await requireAnnouncement(
      this.communicationAnnouncementRepository,
      announcementId,
    );
    assertCanMarkAnnouncementRead(toPlainAnnouncement(announcement));

    const read =
      await this.communicationAnnouncementRepository.markCurrentSchoolAnnouncementRead(
        {
          schoolId: scope.schoolId,
          announcementId: announcement.id,
          userId: scope.actorId,
          readAt: new Date(),
        },
      );

    return presentCommunicationAnnouncementReadReceipt(read);
  }
}

@Injectable()
export class GetCommunicationAnnouncementReadSummaryUseCase {
  constructor(
    private readonly communicationAnnouncementRepository: CommunicationAnnouncementRepository,
  ) {}

  async execute(announcementId: string) {
    requireCommunicationScope();
    const announcement = await requireAnnouncement(
      this.communicationAnnouncementRepository,
      announcementId,
    );

    const summary =
      await this.communicationAnnouncementRepository.getCurrentSchoolAnnouncementReadSummary(
        {
          announcementId: announcement.id,
        },
      );

    return presentCommunicationAnnouncementReadSummary(summary);
  }
}

@Injectable()
export class ListCommunicationAnnouncementAttachmentsUseCase {
  constructor(
    private readonly communicationAnnouncementRepository: CommunicationAnnouncementRepository,
  ) {}

  async execute(announcementId: string) {
    requireCommunicationScope();
    const announcement = await requireAnnouncement(
      this.communicationAnnouncementRepository,
      announcementId,
    );
    const result =
      await this.communicationAnnouncementRepository.listCurrentSchoolAnnouncementAttachments(
        {
          announcementId: announcement.id,
        },
      );

    return presentCommunicationAnnouncementAttachmentList(result);
  }
}

@Injectable()
export class LinkCommunicationAnnouncementAttachmentUseCase {
  constructor(
    private readonly communicationAnnouncementRepository: CommunicationAnnouncementRepository,
  ) {}

  async execute(
    announcementId: string,
    command: LinkCommunicationAnnouncementAttachmentDto,
  ) {
    const scope = requireCommunicationScope();
    const [announcement, file] = await Promise.all([
      requireAnnouncement(
        this.communicationAnnouncementRepository,
        announcementId,
      ),
      this.communicationAnnouncementRepository.findCurrentSchoolFileForAnnouncementAttachment(
        command.fileId,
      ),
    ]);

    if (!file) {
      throw new FilesNotFoundException({ fileId: command.fileId });
    }

    assertCanLinkAnnouncementAttachment(toPlainAnnouncement(announcement));

    const attachment =
      await this.communicationAnnouncementRepository.linkCurrentSchoolAnnouncementAttachment(
        {
          schoolId: scope.schoolId,
          announcementId: announcement.id,
          fileId: file.id,
          createdById: scope.actorId,
          caption: command.caption,
          sortOrder: command.sortOrder,
          buildAuditEntry: (next, before) =>
            buildCommunicationAnnouncementAttachmentAuditEntry({
              scope,
              action: 'communication.announcement_attachment.link',
              attachment: next,
              before,
              changedFields: ['fileId', 'caption', 'sortOrder'],
            }),
        },
      );

    return presentCommunicationAnnouncementAttachment(attachment);
  }
}

@Injectable()
export class DeleteCommunicationAnnouncementAttachmentUseCase {
  constructor(
    private readonly communicationAnnouncementRepository: CommunicationAnnouncementRepository,
  ) {}

  async execute(announcementId: string, attachmentId: string) {
    const scope = requireCommunicationScope();
    const announcement = await requireAnnouncement(
      this.communicationAnnouncementRepository,
      announcementId,
    );
    const attachment = await requireAnnouncementAttachment(
      this.communicationAnnouncementRepository,
      announcement.id,
      attachmentId,
    );

    return this.communicationAnnouncementRepository.deleteCurrentSchoolAnnouncementAttachment(
      {
        announcementId: announcement.id,
        attachmentId: attachment.id,
        buildAuditEntry: (deleted) =>
          buildCommunicationAnnouncementAttachmentAuditEntry({
            scope,
            action: 'communication.announcement_attachment.delete',
            attachment: deleted,
            before: deleted,
            changedFields: ['deleted'],
          }),
      },
    );
  }
}

async function requireAnnouncement(
  repository: CommunicationAnnouncementRepository,
  announcementId: string,
): Promise<CommunicationAnnouncementDetailRecord> {
  const announcement =
    await repository.findCurrentSchoolAnnouncementById(announcementId);
  if (!announcement) {
    throw new NotFoundDomainException('Announcement not found', {
      announcementId,
    });
  }

  return announcement;
}

async function requireAnnouncementAttachment(
  repository: CommunicationAnnouncementRepository,
  announcementId: string,
  attachmentId: string,
): Promise<CommunicationAnnouncementAttachmentRecord> {
  const result = await repository.listCurrentSchoolAnnouncementAttachments({
    announcementId,
  });
  const attachment = result.items.find((item) => item.id === attachmentId);
  if (!attachment) {
    throw new NotFoundDomainException('Announcement attachment not found', {
      announcementId,
      attachmentId,
    });
  }

  return attachment;
}

async function assertAudienceTargetsExist(
  repository: CommunicationAnnouncementRepository,
  audienceRows: CommunicationAnnouncementAudienceInput[],
): Promise<void> {
  if (audienceRows.length === 0) return;

  const validation = await repository.validateAudienceTargetsInCurrentSchool({
    audienceRows: audienceRows as CommunicationAnnouncementAudienceData[],
  });
  if (Object.keys(validation.missing).length > 0) {
    throw new CommunicationAnnouncementInvalidException(
      'Announcement audience target is not available in this school',
      validation.missing,
    );
  }
}

function normalizeAudienceRows(
  audienceType: CommunicationAnnouncementAudienceType,
  rows: CommunicationAnnouncementAudienceRowDto[] | undefined,
): CommunicationAnnouncementAudienceInput[] {
  if (audienceType === CommunicationAnnouncementAudienceType.SCHOOL) {
    return (rows ?? []).map((row) => normalizeAudienceRow(audienceType, row));
  }

  return (rows ?? []).map((row) => normalizeAudienceRow(audienceType, row));
}

function normalizeAudienceRow(
  announcementAudienceType: CommunicationAnnouncementAudienceType,
  row: CommunicationAnnouncementAudienceRowDto,
): CommunicationAnnouncementAudienceInput {
  const rowAudienceType = row.audienceType
    ? normalizeCommunicationAnnouncementAudienceType(row.audienceType)
    : (announcementAudienceType as CommunicationAnnouncementAudienceTypeValue);
  const userId = normalizeAudienceUserId(row);

  return {
    audienceType: rowAudienceType,
    stageId: row.stageId ?? null,
    gradeId: row.gradeId ?? null,
    sectionId: row.sectionId ?? null,
    classroomId: row.classroomId ?? null,
    studentId: row.studentId ?? null,
    guardianId: row.guardianId ?? null,
    userId,
  };
}

function normalizeAudienceUserId(
  row: CommunicationAnnouncementAudienceRowDto,
): string | null {
  if (row.userId && row.teacherUserId && row.userId !== row.teacherUserId) {
    throw new CommunicationAnnouncementInvalidException(
      'Audience row userId and teacherUserId must match when both are provided',
      { userId: row.userId, teacherUserId: row.teacherUserId },
    );
  }

  return row.userId ?? row.teacherUserId ?? null;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  return new Date(value);
}

function toPlainAnnouncement(
  announcement: CommunicationAnnouncementDetailRecord,
): PlainCommunicationAnnouncement {
  return {
    id: announcement.id,
    status: announcement.status as CommunicationAnnouncementStatusValue,
    title: announcement.title,
    body: announcement.body,
    audienceType:
      announcement.audienceType as CommunicationAnnouncementAudienceTypeValue,
    scheduledAt: announcement.scheduledAt,
    publishedAt: announcement.publishedAt,
    archivedAt: announcement.archivedAt,
    expiresAt: announcement.expiresAt,
  };
}

function buildChangedFields(
  command: UpdateCommunicationAnnouncementDto,
  replaceAudience: boolean,
): string[] {
  const fields: string[] = [];
  for (const field of [
    'title',
    'body',
    'priority',
    'scheduledAt',
    'expiresAt',
    'metadata',
  ] as const) {
    if (command[field] !== undefined) fields.push(field);
  }
  if (command.audienceType !== undefined) fields.push('audienceType');
  if (replaceAudience) fields.push('audienceRows');
  fields.push('updatedById');

  return [...new Set(fields)];
}

function buildCommunicationAnnouncementAuditEntry(params: {
  scope: CommunicationScope;
  action:
    | 'communication.announcement.create'
    | 'communication.announcement.update'
    | 'communication.announcement.publish'
    | 'communication.announcement.archive'
    | 'communication.announcement.cancel';
  announcement: CommunicationAnnouncementDetailRecord;
  before?: CommunicationAnnouncementDetailRecord | null;
  changedFields: string[];
}): CommunicationAnnouncementAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: params.action,
    resourceType: 'communication_announcement',
    resourceId: params.announcement.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? {
          targetSchoolId: params.scope.schoolId,
          announcement: summarizeCommunicationAnnouncementForAudit(
            params.before,
          ),
        }
      : undefined,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      announcementId: params.announcement.id,
      announcement: summarizeCommunicationAnnouncementForAudit(
        params.announcement,
      ),
    },
  };
}

function buildCommunicationAnnouncementAttachmentAuditEntry(params: {
  scope: CommunicationScope;
  action:
    | 'communication.announcement_attachment.link'
    | 'communication.announcement_attachment.delete';
  attachment: CommunicationAnnouncementAttachmentRecord;
  before?: CommunicationAnnouncementAttachmentRecord | null;
  changedFields: string[];
}): CommunicationAnnouncementAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: params.action,
    resourceType: 'communication_announcement_attachment',
    resourceId: params.attachment.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? {
          targetSchoolId: params.scope.schoolId,
          attachment: summarizeCommunicationAnnouncementAttachmentForAudit(
            params.before,
          ),
        }
      : undefined,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      announcementId: params.attachment.announcementId,
      attachmentId: params.attachment.id,
      fileId: params.attachment.fileId,
      attachment: summarizeCommunicationAnnouncementAttachmentForAudit(
        params.attachment,
      ),
    },
  };
}

function asPlainMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

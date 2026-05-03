import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export type CommunicationAnnouncementStatusValue =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'CANCELLED';

export type CommunicationAnnouncementPriorityValue =
  | 'LOW'
  | 'NORMAL'
  | 'HIGH'
  | 'URGENT';

export type CommunicationAnnouncementAudienceTypeValue =
  | 'SCHOOL'
  | 'STAGE'
  | 'GRADE'
  | 'SECTION'
  | 'CLASSROOM'
  | 'CUSTOM';

export interface PlainCommunicationAnnouncement {
  id: string;
  status: CommunicationAnnouncementStatusValue;
  title: string;
  body: string;
  audienceType: CommunicationAnnouncementAudienceTypeValue;
  scheduledAt?: Date | null;
  publishedAt?: Date | null;
  archivedAt?: Date | null;
  expiresAt?: Date | null;
}

export interface CommunicationAnnouncementAudienceInput {
  audienceType?: CommunicationAnnouncementAudienceTypeValue;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
  studentId?: string | null;
  guardianId?: string | null;
  userId?: string | null;
}

export interface AnnouncementLifecycleDatesInput {
  status: CommunicationAnnouncementStatusValue;
  scheduledAt?: Date | null;
  publishedAt?: Date | null;
  expiresAt?: Date | null;
}

const ANNOUNCEMENT_STATUS_MAP: Record<
  string,
  CommunicationAnnouncementStatusValue
> = {
  draft: 'DRAFT',
  scheduled: 'SCHEDULED',
  published: 'PUBLISHED',
  archived: 'ARCHIVED',
  cancelled: 'CANCELLED',
};

const ANNOUNCEMENT_PRIORITY_MAP: Record<
  string,
  CommunicationAnnouncementPriorityValue
> = {
  low: 'LOW',
  normal: 'NORMAL',
  high: 'HIGH',
  urgent: 'URGENT',
};

const ANNOUNCEMENT_AUDIENCE_TYPE_MAP: Record<
  string,
  CommunicationAnnouncementAudienceTypeValue
> = {
  school: 'SCHOOL',
  stage: 'STAGE',
  grade: 'GRADE',
  section: 'SECTION',
  classroom: 'CLASSROOM',
  custom: 'CUSTOM',
};

const EDITABLE_STATUSES = new Set<CommunicationAnnouncementStatusValue>([
  'DRAFT',
  'SCHEDULED',
]);

export class CommunicationAnnouncementInvalidException extends DomainException {
  constructor(
    message = 'Announcement payload is invalid',
    details?: Record<string, unknown>,
  ) {
    super({
      code: 'communication.scope.invalid',
      message,
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class CommunicationAnnouncementStateException extends DomainException {
  constructor(
    message = 'Announcement state transition is invalid',
    details?: Record<string, unknown>,
  ) {
    super({
      code: 'communication.scope.invalid',
      message,
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function normalizeCommunicationAnnouncementStatus(
  value: string,
): CommunicationAnnouncementStatusValue {
  const mapped = ANNOUNCEMENT_STATUS_MAP[value.trim().toLowerCase()];
  if (!mapped) {
    throw new CommunicationAnnouncementInvalidException(
      'Announcement status is invalid',
      { field: 'status', value },
    );
  }

  return mapped;
}

export function normalizeCommunicationAnnouncementPriority(
  value: string,
): CommunicationAnnouncementPriorityValue {
  const mapped = ANNOUNCEMENT_PRIORITY_MAP[value.trim().toLowerCase()];
  if (!mapped) {
    throw new CommunicationAnnouncementInvalidException(
      'Announcement priority is invalid',
      { field: 'priority', value },
    );
  }

  return mapped;
}

export function normalizeCommunicationAnnouncementAudienceType(
  value: string,
): CommunicationAnnouncementAudienceTypeValue {
  const mapped = ANNOUNCEMENT_AUDIENCE_TYPE_MAP[value.trim().toLowerCase()];
  if (!mapped) {
    throw new CommunicationAnnouncementInvalidException(
      'Announcement audience type is invalid',
      { field: 'audienceType', value },
    );
  }

  return mapped;
}

export function normalizeAnnouncementTitle(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new CommunicationAnnouncementInvalidException(
      'Announcement title is required',
      { field: 'title' },
    );
  }
  if (trimmed.length > 160) {
    throw new CommunicationAnnouncementInvalidException(
      'Announcement title is too long',
      { field: 'title', maxLength: 160 },
    );
  }

  return trimmed;
}

export function normalizeAnnouncementBody(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new CommunicationAnnouncementInvalidException(
      'Announcement body is required',
      { field: 'body' },
    );
  }
  if (trimmed.length > 20000) {
    throw new CommunicationAnnouncementInvalidException(
      'Announcement body is too long',
      { field: 'body', maxLength: 20000 },
    );
  }

  return trimmed;
}

export function assertCanCreateAnnouncement(params: {
  status: CommunicationAnnouncementStatusValue;
  title: string;
  body: string;
  audienceType: CommunicationAnnouncementAudienceTypeValue;
  audienceRows: CommunicationAnnouncementAudienceInput[];
  scheduledAt?: Date | null;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  now?: Date;
}): void {
  if (!EDITABLE_STATUSES.has(params.status)) {
    throw new CommunicationAnnouncementStateException(
      'Announcements can only be created as draft or scheduled',
      { status: params.status },
    );
  }

  normalizeAnnouncementTitle(params.title);
  normalizeAnnouncementBody(params.body);
  assertAnnouncementAudienceIsValid({
    audienceType: params.audienceType,
    audienceRows: params.audienceRows,
  });
  assertAnnouncementLifecycleDates(
    {
      status: params.status,
      scheduledAt: params.scheduledAt,
      expiresAt: params.expiresAt,
    },
    params.now,
  );
  assertAnnouncementMetadata(params.metadata);
}

export function assertCanUpdateAnnouncement(params: {
  announcement: PlainCommunicationAnnouncement;
  title: string;
  body: string;
  audienceType: CommunicationAnnouncementAudienceTypeValue;
  audienceRows: CommunicationAnnouncementAudienceInput[];
  scheduledAt?: Date | null;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  now?: Date;
}): void {
  if (!EDITABLE_STATUSES.has(params.announcement.status)) {
    throw new CommunicationAnnouncementStateException(
      'Published, archived, and cancelled announcements cannot be edited',
      {
        announcementId: params.announcement.id,
        status: params.announcement.status,
      },
    );
  }

  normalizeAnnouncementTitle(params.title);
  normalizeAnnouncementBody(params.body);
  assertAnnouncementAudienceIsValid({
    audienceType: params.audienceType,
    audienceRows: params.audienceRows,
  });
  assertAnnouncementLifecycleDates(
    {
      status: params.announcement.status,
      scheduledAt: params.scheduledAt,
      expiresAt: params.expiresAt,
      publishedAt: params.announcement.publishedAt,
    },
    params.now,
  );
  assertAnnouncementMetadata(params.metadata);
}

export function assertCanPublishAnnouncement(
  announcement: PlainCommunicationAnnouncement,
  now = new Date(),
): void {
  if (!EDITABLE_STATUSES.has(announcement.status)) {
    throw new CommunicationAnnouncementStateException(
      'Only draft or scheduled announcements can be published',
      {
        announcementId: announcement.id,
        status: announcement.status,
      },
    );
  }

  normalizeAnnouncementTitle(announcement.title);
  normalizeAnnouncementBody(announcement.body);
  assertAnnouncementNotExpired(announcement, now);
}

export function assertCanArchiveAnnouncement(
  announcement: PlainCommunicationAnnouncement,
): void {
  if (announcement.status === 'CANCELLED') {
    throw new CommunicationAnnouncementStateException(
      'Cancelled announcements cannot be archived',
      {
        announcementId: announcement.id,
        status: announcement.status,
      },
    );
  }
  if (announcement.status === 'ARCHIVED') {
    throw new CommunicationAnnouncementStateException(
      'Announcement is already archived',
      {
        announcementId: announcement.id,
        status: announcement.status,
      },
    );
  }
}

export function assertCanCancelAnnouncement(
  announcement: PlainCommunicationAnnouncement,
): void {
  if (announcement.status !== 'DRAFT' && announcement.status !== 'SCHEDULED') {
    throw new CommunicationAnnouncementStateException(
      'Only draft or scheduled announcements can be cancelled',
      {
        announcementId: announcement.id,
        status: announcement.status,
      },
    );
  }
}

export function assertCanMarkAnnouncementRead(
  announcement: PlainCommunicationAnnouncement,
  now = new Date(),
): void {
  if (announcement.status !== 'PUBLISHED' || Boolean(announcement.archivedAt)) {
    throw new CommunicationAnnouncementStateException(
      'Only published announcements can be marked read',
      {
        announcementId: announcement.id,
        status: announcement.status,
      },
    );
  }

  assertAnnouncementNotExpired(announcement, now);
}

export function assertCanLinkAnnouncementAttachment(
  announcement: PlainCommunicationAnnouncement,
): void {
  if (!EDITABLE_STATUSES.has(announcement.status)) {
    throw new CommunicationAnnouncementStateException(
      'Attachments can only be linked to draft or scheduled announcements',
      {
        announcementId: announcement.id,
        status: announcement.status,
      },
    );
  }
}

export function assertAnnouncementAudienceIsValid(params: {
  audienceType: CommunicationAnnouncementAudienceTypeValue;
  audienceRows: CommunicationAnnouncementAudienceInput[];
}): void {
  const rows = params.audienceRows ?? [];

  if (params.audienceType === 'SCHOOL') {
    if (rows.length > 0) {
      throw new CommunicationAnnouncementInvalidException(
        'School-wide announcements do not accept audience target rows',
        { audienceType: params.audienceType },
      );
    }
    return;
  }

  if (rows.length === 0) {
    throw new CommunicationAnnouncementInvalidException(
      'Announcement audience targets are required',
      { audienceType: params.audienceType },
    );
  }

  const seenTargets = new Set<string>();
  for (const row of rows) {
    const rowAudienceType = row.audienceType ?? params.audienceType;
    if (rowAudienceType !== params.audienceType) {
      throw new CommunicationAnnouncementInvalidException(
        'Audience row type must match the announcement audience type',
        {
          audienceType: params.audienceType,
          rowAudienceType,
        },
      );
    }

    const targetFields = getAudienceTargetFields(row);
    if (params.audienceType === 'CUSTOM') {
      if (targetFields.length !== 1) {
        throw new CommunicationAnnouncementInvalidException(
          'Custom audience rows must identify exactly one supported target',
          { targetFields },
        );
      }
    } else {
      const requiredField = requiredFieldForAudienceType(params.audienceType);
      if (
        targetFields.length !== 1 ||
        targetFields[0].field !== requiredField
      ) {
        throw new CommunicationAnnouncementInvalidException(
          'Audience row target does not match the audience type',
          {
            audienceType: params.audienceType,
            requiredField,
            targetFields: targetFields.map((field) => field.field),
          },
        );
      }
    }

    const targetKey = `${targetFields[0].field}:${targetFields[0].value}`;
    if (seenTargets.has(targetKey)) {
      throw new CommunicationAnnouncementInvalidException(
        'Announcement audience target is duplicated',
        { targetKey },
      );
    }
    seenTargets.add(targetKey);
  }
}

export function assertAnnouncementLifecycleDates(
  input: AnnouncementLifecycleDatesInput,
  now = new Date(),
): void {
  if (input.status === 'SCHEDULED' && !input.scheduledAt) {
    throw new CommunicationAnnouncementInvalidException(
      'Scheduled announcements require scheduledAt',
      { field: 'scheduledAt' },
    );
  }

  if (input.scheduledAt && input.scheduledAt.getTime() <= now.getTime()) {
    throw new CommunicationAnnouncementInvalidException(
      'scheduledAt must be in the future',
      {
        field: 'scheduledAt',
        scheduledAt: input.scheduledAt.toISOString(),
      },
    );
  }

  if (!input.expiresAt) return;

  if (input.expiresAt.getTime() <= now.getTime()) {
    throw new CommunicationAnnouncementInvalidException(
      'expiresAt must be in the future',
      {
        field: 'expiresAt',
        expiresAt: input.expiresAt.toISOString(),
      },
    );
  }

  const lowerBound = input.scheduledAt ?? input.publishedAt ?? null;
  if (lowerBound && input.expiresAt.getTime() <= lowerBound.getTime()) {
    throw new CommunicationAnnouncementInvalidException(
      'expiresAt must be after the announcement lifecycle date',
      {
        field: 'expiresAt',
        lowerBound: lowerBound.toISOString(),
      },
    );
  }
}

export function assertAnnouncementMetadata(
  value: Record<string, unknown> | null | undefined,
): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new CommunicationAnnouncementInvalidException(
      'Announcement metadata must be an object',
      { field: 'metadata' },
    );
  }
}

function assertAnnouncementNotExpired(
  announcement: Pick<PlainCommunicationAnnouncement, 'id' | 'expiresAt'>,
  now: Date,
): void {
  if (
    announcement.expiresAt &&
    announcement.expiresAt.getTime() <= now.getTime()
  ) {
    throw new CommunicationAnnouncementStateException(
      'Expired announcements cannot be used for this action',
      {
        announcementId: announcement.id,
        expiresAt: announcement.expiresAt.toISOString(),
      },
    );
  }
}

function requiredFieldForAudienceType(
  audienceType: CommunicationAnnouncementAudienceTypeValue,
): string {
  switch (audienceType) {
    case 'STAGE':
      return 'stageId';
    case 'GRADE':
      return 'gradeId';
    case 'SECTION':
      return 'sectionId';
    case 'CLASSROOM':
      return 'classroomId';
    case 'CUSTOM':
    case 'SCHOOL':
      throw new CommunicationAnnouncementInvalidException(
        'Audience type does not have a single required target field',
        { audienceType },
      );
  }
}

function getAudienceTargetFields(
  row: CommunicationAnnouncementAudienceInput,
): Array<{ field: string; value: string }> {
  return [
    ['stageId', row.stageId],
    ['gradeId', row.gradeId],
    ['sectionId', row.sectionId],
    ['classroomId', row.classroomId],
    ['studentId', row.studentId],
    ['guardianId', row.guardianId],
    ['userId', row.userId],
  ]
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([field, value]) => ({
      field: field as string,
      value: value as string,
    }));
}

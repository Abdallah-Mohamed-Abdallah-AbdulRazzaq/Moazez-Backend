import {
  StudentAnnouncementAttachmentDto,
  StudentAnnouncementAttachmentsResponseDto,
  StudentAnnouncementCardDto,
  StudentAnnouncementReadResponseDto,
  StudentAnnouncementResponseDto,
  StudentAnnouncementsListResponseDto,
} from '../dto/student-announcements.dto';
import type {
  StudentAnnouncementAttachmentRecord,
  StudentAnnouncementReadModel,
  StudentAnnouncementReadResult,
  StudentAnnouncementsListReadModel,
} from '../infrastructure/student-announcements-read.adapter';

export class StudentAnnouncementsPresenter {
  static presentList(
    result: StudentAnnouncementsListReadModel,
  ): StudentAnnouncementsListResponseDto {
    return {
      announcements: result.items.map((item) => presentAnnouncement(item)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  static presentAnnouncement(
    item: StudentAnnouncementReadModel,
  ): StudentAnnouncementResponseDto {
    return {
      announcement: presentAnnouncement(item),
    };
  }

  static presentReadResult(
    result: StudentAnnouncementReadResult,
  ): StudentAnnouncementReadResponseDto {
    return {
      announcementId: result.announcementId,
      announcement_id: result.announcementId,
      readAt: result.readAt,
      read_at: result.readAt,
    };
  }

  static presentAttachments(params: {
    announcementId: string;
    attachments: StudentAnnouncementAttachmentRecord[];
  }): StudentAnnouncementAttachmentsResponseDto {
    return {
      announcementId: params.announcementId,
      announcement_id: params.announcementId,
      attachments: params.attachments.map((attachment) =>
        presentAttachment(attachment),
      ),
    };
  }
}

function presentAnnouncement(
  item: StudentAnnouncementReadModel,
): StudentAnnouncementCardDto {
  const announcement = item.announcement;
  const publishedAt = presentNullableDate(announcement.publishedAt);
  const expiresAt = presentNullableDate(announcement.expiresAt);
  const readAt = presentNullableDate(item.readAt);
  const isPinned =
    announcement.isPinned &&
    (!announcement.pinnedUntil || announcement.pinnedUntil > new Date());

  return {
    id: announcement.id,
    announcementId: announcement.id,
    announcement_id: announcement.id,
    title: announcement.title,
    description: announcement.body,
    body: announcement.body,
    sender: senderName(announcement),
    dateLabel: publishedAt ?? announcement.createdAt.toISOString(),
    date_label: publishedAt ?? announcement.createdAt.toISOString(),
    category: announcement.category ?? announcement.audienceType.toLowerCase(),
    priority: announcement.priority.toLowerCase(),
    isPinned,
    is_pinned: isPinned,
    isNew: readAt === null,
    is_new: readAt === null,
    actionLabel: announcement.actionLabel,
    action_label: announcement.actionLabel,
    image: null,
    publishedAt,
    published_at: publishedAt,
    expiresAt,
    expires_at: expiresAt,
    readAt,
    read_at: readAt,
    attachmentsCount: announcement._count.attachments,
    attachments_count: announcement._count.attachments,
  };
}

function presentAttachment(
  attachment: StudentAnnouncementAttachmentRecord,
): StudentAnnouncementAttachmentDto {
  return {
    fileId: attachment.fileId,
    filename: attachment.file.originalName,
    mimeType: attachment.file.mimeType,
    size: attachment.file.sizeBytes.toString(),
  };
}

function senderName(
  announcement: StudentAnnouncementReadModel['announcement'],
): string | null {
  const user = announcement.publishedBy ?? announcement.createdBy ?? null;
  if (!user) return null;

  return `${user.firstName} ${user.lastName}`.trim();
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

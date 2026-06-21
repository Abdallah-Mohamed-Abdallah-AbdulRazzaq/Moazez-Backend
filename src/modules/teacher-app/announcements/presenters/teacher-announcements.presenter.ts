import { CommunicationAnnouncementStatus } from '@prisma/client';
import {
  canArchiveTeacherAnnouncement,
  canEditTeacherAnnouncement,
  parseTeacherAnnouncementMetadata,
  presentTeacherAnnouncementPriority,
  presentTeacherAnnouncementStatus,
} from '../domain/teacher-announcement-app-domain';
import {
  TeacherAnnouncementResponseDto,
  TeacherAnnouncementsListResponseDto,
} from '../dto/teacher-announcements.dto';

export interface TeacherAnnouncementPresentationRecord {
  id: string;
  title: string;
  body: string;
  status: CommunicationAnnouncementStatus;
  priority: Parameters<typeof presentTeacherAnnouncementPriority>[0];
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: unknown;
  _count: {
    attachments: number;
    reads: number;
  };
}

export interface TeacherAnnouncementListResult {
  items: TeacherAnnouncementPresentationRecord[];
  page: number;
  limit: number;
  total: number;
}

export class TeacherAnnouncementsPresenter {
  static presentList(
    result: TeacherAnnouncementListResult,
  ): TeacherAnnouncementsListResponseDto {
    return {
      announcements: result.items.map((announcement) =>
        presentAnnouncement(announcement),
      ),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  static presentAnnouncement(
    announcement: TeacherAnnouncementPresentationRecord,
  ): TeacherAnnouncementResponseDto {
    return {
      announcement: presentAnnouncement(announcement),
    };
  }
}

function presentAnnouncement(announcement: TeacherAnnouncementPresentationRecord) {
  const metadata = parseTeacherAnnouncementMetadata(announcement.metadata);
  const teacherApp = metadata?.teacherApp;
  const canEdit = canEditTeacherAnnouncement(announcement.status);

  return {
    announcementId: announcement.id,
    title: announcement.title,
    body: announcement.body,
    status: presentTeacherAnnouncementStatus(announcement.status),
    audience: teacherApp?.audience ?? 'students_and_parents',
    target: {
      type: teacherApp?.targetType ?? 'classroom',
      classId: teacherApp?.classId ?? '',
      classroomId: teacherApp?.classroomId ?? '',
      label: teacherApp?.label ?? '',
    },
    priority: presentTeacherAnnouncementPriority(announcement.priority),
    createdAt: announcement.createdAt.toISOString(),
    publishedAt: presentNullableDate(announcement.publishedAt),
    archivedAt: presentNullableDate(announcement.archivedAt),
    updatedAt: announcement.updatedAt.toISOString(),
    attachmentsCount: announcement._count.attachments,
    readCount: announcement._count.reads,
    canEdit,
    canPublish: canEdit,
    canArchive: canArchiveTeacherAnnouncement(announcement.status),
  };
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

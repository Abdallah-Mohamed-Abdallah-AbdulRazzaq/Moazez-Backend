import {
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { isTeacherAnnouncementAudience } from '../../../communication/domain/teacher-app-announcement-metadata';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';

export {
  buildTeacherAnnouncementMetadata,
  parseTeacherAnnouncementMetadata,
  TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE,
  TEACHER_ANNOUNCEMENT_AUDIENCES,
  type TeacherAnnouncementAppMetadata,
  type TeacherAnnouncementAudience,
} from '../../../communication/domain/teacher-app-announcement-metadata';
import type { TeacherAnnouncementAudience } from '../../../communication/domain/teacher-app-announcement-metadata';

export const TEACHER_ANNOUNCEMENT_PRIORITIES = ['normal', 'important'] as const;

export const TEACHER_ANNOUNCEMENT_TARGET_TYPES = ['classroom'] as const;

export type TeacherAnnouncementPriority =
  (typeof TEACHER_ANNOUNCEMENT_PRIORITIES)[number];

export interface TeacherAnnouncementTargetInput {
  type: string;
  classId?: string;
  classroomId?: string;
}

export interface TeacherAnnouncementResolvedTarget {
  type: 'classroom';
  classId: string;
  classroomId: string;
  label: string;
}

export function resolveTeacherAnnouncementTarget(params: {
  target: TeacherAnnouncementTargetInput | undefined;
  allocations: TeacherAppAllocationRecord[];
}): TeacherAnnouncementResolvedTarget {
  const target = params.target;
  if (!target) {
    throw new ValidationDomainException(
      'Teacher announcement target is required',
      {
        field: 'target',
      },
    );
  }

  if (target.type !== 'classroom') {
    throw new ValidationDomainException(
      'Teacher announcements only support classroom targets',
      { field: 'target.type', value: target.type },
    );
  }

  if (!target.classId && !target.classroomId) {
    throw new ValidationDomainException(
      'Teacher announcement target requires classId or classroomId',
      { field: 'target' },
    );
  }

  const allocation = target.classId
    ? params.allocations.find((item) => item.id === target.classId)
    : params.allocations.find(
        (item) => item.classroomId === target.classroomId,
      );

  if (!allocation) {
    throw new ValidationDomainException(
      'Teacher announcement target is not available to this teacher',
      {
        field: target.classId ? 'target.classId' : 'target.classroomId',
      },
    );
  }

  return {
    type: 'classroom',
    classId: allocation.id,
    classroomId: allocation.classroomId,
    label: buildTeacherAnnouncementTargetLabel(allocation),
  };
}

export function normalizeTeacherAnnouncementAudience(
  value: string | undefined,
): TeacherAnnouncementAudience {
  if (isTeacherAnnouncementAudience(value)) return value;

  throw new ValidationDomainException(
    'Teacher announcement audience is invalid',
    { field: 'audience', value },
  );
}

export function mapTeacherAnnouncementPriorityToCore(
  value: string | undefined,
): 'normal' | 'high' {
  if (!value || value === 'normal') return 'normal';
  if (value === 'important') return 'high';

  throw new ValidationDomainException(
    'Teacher announcement priority is invalid',
    { field: 'priority', value },
  );
}

export function presentTeacherAnnouncementPriority(
  priority: CommunicationAnnouncementPriority,
): TeacherAnnouncementPriority {
  return priority === CommunicationAnnouncementPriority.HIGH ||
    priority === CommunicationAnnouncementPriority.URGENT
    ? 'important'
    : 'normal';
}

export function presentTeacherAnnouncementStatus(
  status: CommunicationAnnouncementStatus,
): string {
  return status.toLowerCase();
}

export function canEditTeacherAnnouncement(
  status: CommunicationAnnouncementStatus,
): boolean {
  return (
    status === CommunicationAnnouncementStatus.DRAFT ||
    status === CommunicationAnnouncementStatus.SCHEDULED
  );
}

export function canArchiveTeacherAnnouncement(
  status: CommunicationAnnouncementStatus,
): boolean {
  return (
    status !== CommunicationAnnouncementStatus.ARCHIVED &&
    status !== CommunicationAnnouncementStatus.CANCELLED
  );
}

function buildTeacherAnnouncementTargetLabel(
  allocation: TeacherAppAllocationRecord,
): string {
  const classroomName = allocation.classroom
    ? preferredName(allocation.classroom)
    : null;
  const sectionName = allocation.classroom?.section
    ? preferredName(allocation.classroom.section)
    : null;
  const gradeName = allocation.classroom?.section?.grade
    ? preferredName(allocation.classroom.section.grade)
    : null;

  return (
    [gradeName, sectionName, classroomName].filter(Boolean).join(' / ') ||
    allocation.id
  );
}

function preferredName(value: {
  nameEn?: string | null;
  nameAr?: string | null;
}) {
  return value.nameEn ?? value.nameAr ?? null;
}

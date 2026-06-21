import {
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';

export const TEACHER_ANNOUNCEMENT_AUDIENCES = [
  'students',
  'parents',
  'students_and_parents',
] as const;

export const TEACHER_ANNOUNCEMENT_PRIORITIES = [
  'normal',
  'important',
] as const;

export const TEACHER_ANNOUNCEMENT_TARGET_TYPES = ['classroom'] as const;

export const TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE =
  'teacher_app' as const;

export type TeacherAnnouncementAudience =
  (typeof TEACHER_ANNOUNCEMENT_AUDIENCES)[number];

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

export interface TeacherAnnouncementAppMetadata extends Record<string, unknown> {
  teacherApp: {
    source: typeof TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE;
    targetType: 'classroom';
    classId: string;
    classroomId: string;
    label: string;
    audience: TeacherAnnouncementAudience;
  };
}

export function resolveTeacherAnnouncementTarget(params: {
  target: TeacherAnnouncementTargetInput | undefined;
  allocations: TeacherAppAllocationRecord[];
}): TeacherAnnouncementResolvedTarget {
  const target = params.target;
  if (!target) {
    throw new ValidationDomainException('Teacher announcement target is required', {
      field: 'target',
    });
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

export function buildTeacherAnnouncementMetadata(params: {
  target: TeacherAnnouncementResolvedTarget;
  audience: TeacherAnnouncementAudience;
}): TeacherAnnouncementAppMetadata {
  return {
    teacherApp: {
      source: TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE,
      targetType: params.target.type,
      classId: params.target.classId,
      classroomId: params.target.classroomId,
      label: params.target.label,
      audience: params.audience,
    },
  };
}

export function parseTeacherAnnouncementMetadata(
  value: unknown,
): TeacherAnnouncementAppMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const teacherApp = (value as Record<string, unknown>).teacherApp;
  if (!teacherApp || typeof teacherApp !== 'object' || Array.isArray(teacherApp)) {
    return null;
  }

  const metadata = teacherApp as Record<string, unknown>;
  if (metadata.source !== TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE) return null;
  if (metadata.targetType !== 'classroom') return null;
  if (typeof metadata.classId !== 'string') return null;
  if (typeof metadata.classroomId !== 'string') return null;
  if (typeof metadata.label !== 'string') return null;
  if (!isTeacherAnnouncementAudience(metadata.audience)) return null;

  return {
    teacherApp: {
      source: TEACHER_APP_ANNOUNCEMENT_METADATA_SOURCE,
      targetType: 'classroom',
      classId: metadata.classId,
      classroomId: metadata.classroomId,
      label: metadata.label,
      audience: metadata.audience,
    },
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

function isTeacherAnnouncementAudience(
  value: unknown,
): value is TeacherAnnouncementAudience {
  return (
    typeof value === 'string' &&
    (TEACHER_ANNOUNCEMENT_AUDIENCES as readonly string[]).includes(value)
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

function preferredName(value: { nameEn?: string | null; nameAr?: string | null }) {
  return value.nameEn ?? value.nameAr ?? null;
}

import { LessonPlanItemStatus } from '@prisma/client';

export type ParentChildLessonApiStatus =
  | 'planned'
  | 'in_progress'
  | 'done'
  | 'skipped'
  | 'rescheduled'
  | 'cancelled';

export function presentParentChildLessonStatus(
  status: LessonPlanItemStatus,
): ParentChildLessonApiStatus {
  switch (status) {
    case LessonPlanItemStatus.PLANNED:
      return 'planned';
    case LessonPlanItemStatus.IN_PROGRESS:
      return 'in_progress';
    case LessonPlanItemStatus.DONE:
      return 'done';
    case LessonPlanItemStatus.SKIPPED:
      return 'skipped';
    case LessonPlanItemStatus.RESCHEDULED:
      return 'rescheduled';
    case LessonPlanItemStatus.CANCELLED:
      return 'cancelled';
  }
}

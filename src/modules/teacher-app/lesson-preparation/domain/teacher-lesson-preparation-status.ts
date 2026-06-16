import { LessonPlanItemStatus } from '@prisma/client';
import { TeacherLessonPreparationStatusDto } from '../dto/teacher-lesson-preparation.dto';
import {
  TeacherLessonPreparationInvalidStatusException,
  TeacherLessonPreparationInvalidTransitionException,
} from './teacher-lesson-preparation.errors';

export type TeacherLessonPreparationApiStatus =
  | 'planned'
  | 'in_progress'
  | 'done'
  | 'skipped'
  | 'rescheduled'
  | 'cancelled';

export function mapTeacherLessonPreparationStatus(
  status: TeacherLessonPreparationStatusDto | string,
): LessonPlanItemStatus {
  switch (status) {
    case TeacherLessonPreparationStatusDto.PLANNED:
      return LessonPlanItemStatus.PLANNED;
    case TeacherLessonPreparationStatusDto.IN_PROGRESS:
      return LessonPlanItemStatus.IN_PROGRESS;
    case TeacherLessonPreparationStatusDto.DONE:
      return LessonPlanItemStatus.DONE;
    case TeacherLessonPreparationStatusDto.SKIPPED:
      return LessonPlanItemStatus.SKIPPED;
    default:
      throw new TeacherLessonPreparationInvalidStatusException({ status });
  }
}

export function presentTeacherLessonPreparationStatus(
  status: LessonPlanItemStatus,
): TeacherLessonPreparationApiStatus {
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

export function assertTeacherLessonPreparationTransition(params: {
  current: LessonPlanItemStatus;
  target: LessonPlanItemStatus;
}): void {
  if (params.current === params.target) return;

  const allowed: Record<LessonPlanItemStatus, LessonPlanItemStatus[]> = {
    [LessonPlanItemStatus.PLANNED]: [
      LessonPlanItemStatus.IN_PROGRESS,
      LessonPlanItemStatus.DONE,
      LessonPlanItemStatus.SKIPPED,
    ],
    [LessonPlanItemStatus.IN_PROGRESS]: [
      LessonPlanItemStatus.DONE,
      LessonPlanItemStatus.SKIPPED,
    ],
    [LessonPlanItemStatus.DONE]: [],
    [LessonPlanItemStatus.SKIPPED]: [],
    [LessonPlanItemStatus.RESCHEDULED]: [],
    [LessonPlanItemStatus.CANCELLED]: [],
  };

  if (!allowed[params.current].includes(params.target)) {
    throw new TeacherLessonPreparationInvalidTransitionException({
      from: params.current,
      to: params.target,
    });
  }
}

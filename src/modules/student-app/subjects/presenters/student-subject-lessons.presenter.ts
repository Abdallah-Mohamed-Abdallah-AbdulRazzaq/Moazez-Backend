import { LessonContentItemType } from '@prisma/client';
import type { StudentAppContext } from '../../shared/student-app.types';
import { presentStudentLessonStatus } from '../../lessons/domain/student-lesson-status';
import type {
  StudentSubjectLessonItemDto,
  StudentSubjectLessonsResponseDto,
} from '../dto/student-subject-lessons-response.dto';
import type { StudentSubjectLessonItemRecord } from '../infrastructure/student-subject-lessons-read.adapter';

export class StudentSubjectLessonsPresenter {
  static presentPage(params: {
    context: StudentAppContext;
    items: StudentSubjectLessonItemRecord[];
    nextCursor: string | null;
    hasNextPage: boolean;
  }): StudentSubjectLessonsResponseDto {
    return {
      items: params.items.map((item) =>
        this.presentItem({ context: params.context, item }),
      ),
      pageInfo: {
        nextCursor: params.nextCursor,
        hasNextPage: params.hasNextPage,
      },
    };
  }

  static presentItem(params: {
    context: StudentAppContext;
    item: StudentSubjectLessonItemRecord;
  }): StudentSubjectLessonItemDto {
    const { context, item } = params;
    const period = visiblePeriod({ context, item });
    const content = item.lesson.contentItems;

    return {
      lessonPlanItemId: item.id,
      plannedDate: formatDateOnly(item.plannedDate),
      status: presentStudentLessonStatus(item.status),
      title: item.title,
      unit: {
        id: item.unit.id,
        title: item.unit.title,
        sortOrder: item.unit.sortOrder,
      },
      lesson: {
        id: item.lesson.id,
        title: item.lesson.title,
        sortOrder: item.lesson.sortOrder,
      },
      period: {
        id: period?.id ?? null,
        label: period?.label ?? null,
      },
      contentSummary: {
        totalCount: content.length,
        requiredCount: content.filter((item) => item.isRequired).length,
        videoCount: content.filter(
          (item) => item.type === LessonContentItemType.VIDEO_LINK,
        ).length,
        fileCount: content.filter(
          (item) => item.type === LessonContentItemType.FILE,
        ).length,
        hasPlayableVideo: false,
      },
    };
  }
}

export function studentSubjectLessonOrderingPeriodIndex(
  item: StudentSubjectLessonItemRecord,
): number | null {
  return item.timetableEntry?.period.periodIndex ?? null;
}

function visiblePeriod(params: {
  context: StudentAppContext;
  item: StudentSubjectLessonItemRecord;
}):
  | NonNullable<StudentSubjectLessonItemRecord['timetableEntry']>['period']
  | null {
  const entry = params.item.timetableEntry;
  if (!entry) return null;
  if (entry.academicYearId !== params.context.academicYearId) return null;
  if (entry.termId !== params.context.termId) return null;
  if (entry.classroomId !== params.context.classroomId) return null;

  return entry.period;
}

function formatDateOnly(date: Date | null): string {
  if (!date) {
    throw new Error('Subject lesson discovery received a null planned date');
  }

  const year = `${date.getUTCFullYear()}`.padStart(4, '0');
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

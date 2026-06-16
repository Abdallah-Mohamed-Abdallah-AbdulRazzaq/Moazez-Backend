import type { TeacherScheduleDate, TeacherScheduleWeek } from '../../schedule/application/teacher-schedule-date';
import type {
  TeacherLessonPreparationItemDto,
  TeacherLessonPreparationTodayResponseDto,
  TeacherLessonPreparationWeekResponseDto,
} from '../dto/teacher-lesson-preparation-response.dto';
import { presentTeacherLessonPreparationStatus } from '../domain/teacher-lesson-preparation-status';
import type { TeacherLessonPreparationItemRecord } from '../infrastructure/teacher-lesson-preparation-read.adapter';

export class TeacherLessonPreparationPresenter {
  static presentToday(params: {
    date: TeacherScheduleDate;
    items: TeacherLessonPreparationItemRecord[];
  }): TeacherLessonPreparationTodayResponseDto {
    return {
      date: params.date.date,
      dayOfWeek: params.date.dayOfWeek,
      items: sortItems(params.items).map((item) => this.presentItem(item)),
    };
  }

  static presentWeek(params: {
    week: TeacherScheduleWeek;
    items: TeacherLessonPreparationItemRecord[];
  }): TeacherLessonPreparationWeekResponseDto {
    return {
      weekStartDate: params.week.weekStartDate,
      weekEndDate: params.week.weekEndDate,
      days: params.week.days.map((day) => ({
        date: day.date,
        dayOfWeek: day.dayOfWeek,
        items: sortItems(
          params.items.filter(
            (item) => formatDateOnly(item.plannedDate) === day.date,
          ),
        ).map((item) => this.presentItem(item)),
      })),
    };
  }

  static presentItem(
    item: TeacherLessonPreparationItemRecord,
  ): TeacherLessonPreparationItemDto {
    const period = item.timetableEntry?.period
      ? item.timetableEntry.period
      : null;

    return {
      lessonPlanItemId: item.id,
      lessonPlanId: item.lessonPlanId,
      teacherSubjectAllocationId: item.lessonPlan.teacherSubjectAllocationId,
      timetableEntryId: item.timetableEntryId ?? null,
      plannedDate: formatDateOnly(item.plannedDate),
      dayOfWeek: item.dayOfWeek ?? item.timetableEntry?.dayOfWeek ?? null,
      status: presentTeacherLessonPreparationStatus(item.status),
      title: item.title,
      notes: item.notes ?? null,
      subject: {
        id: item.lessonPlan.subject.id,
        name: localizedName(item.lessonPlan.subject),
        nameAr: item.lessonPlan.subject.nameAr,
        nameEn: item.lessonPlan.subject.nameEn,
        code: item.lessonPlan.subject.code ?? null,
        color: item.lessonPlan.subject.color ?? null,
      },
      classroom: {
        id: item.lessonPlan.classroom.id,
        name: localizedName(item.lessonPlan.classroom),
        nameAr: item.lessonPlan.classroom.nameAr,
        nameEn: item.lessonPlan.classroom.nameEn,
      },
      period: period
        ? {
            id: period.id,
            label: period.label,
            periodIndex: period.periodIndex,
            startTime: period.startTime,
            endTime: period.endTime,
          }
        : null,
      curriculum: {
        id: item.curriculum.id,
        title: item.curriculum.title,
      },
      unit: {
        id: item.unit.id,
        title: item.unit.title,
        sortOrder: item.unit.sortOrder,
      },
      lesson: {
        id: item.lesson.id,
        title: item.lesson.title,
        sortOrder: item.lesson.sortOrder,
        objectives: Array.isArray(item.lesson.objectives)
          ? item.lesson.objectives
          : [],
      },
      content: item.lesson.contentItems.map((content) => ({
        contentItemId: content.id,
        type: content.type.toLowerCase(),
        title: content.title,
        bodyText: content.bodyText ?? null,
        url: content.url ?? null,
        file:
          content.file && !content.file.deletedAt
            ? {
                fileId: content.file.id,
                filename: content.file.originalName,
                mimeType: content.file.mimeType,
                sizeBytes: content.file.sizeBytes.toString(),
              }
            : null,
        sortOrder: content.sortOrder,
        isRequired: content.isRequired,
        estimatedMinutes: content.estimatedMinutes ?? null,
        metadata: content.metadata === null ? null : content.metadata,
      })),
    };
  }
}

function sortItems(
  items: TeacherLessonPreparationItemRecord[],
): TeacherLessonPreparationItemRecord[] {
  return [...items].sort((left, right) => {
    const leftDate = formatDateOnly(left.plannedDate) ?? '';
    const rightDate = formatDateOnly(right.plannedDate) ?? '';
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

    const leftPeriod = left.timetableEntry?.period?.periodIndex ?? Number.MAX_SAFE_INTEGER;
    const rightPeriod = right.timetableEntry?.period?.periodIndex ?? Number.MAX_SAFE_INTEGER;
    if (leftPeriod !== rightPeriod) return leftPeriod - rightPeriod;

    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.id.localeCompare(right.id);
  });
}

function localizedName(value: {
  nameEn?: string | null;
  nameAr?: string | null;
}): string {
  return value.nameEn ?? value.nameAr ?? '';
}

function formatDateOnly(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

import type { TeacherScheduleDate, TeacherScheduleWeek } from '../application/teacher-schedule-date';
import type { TeacherScheduleEntryRecord } from '../infrastructure/teacher-schedule-read.adapter';
import type {
  TeacherDailyScheduleResponseDto,
  TeacherScheduleItemDto,
  TeacherWeeklyScheduleResponseDto,
} from '../dto/teacher-schedule.dto';

export class TeacherSchedulePresenter {
  static presentDaily(params: {
    date: TeacherScheduleDate;
    entries: TeacherScheduleEntryRecord[];
  }): TeacherDailyScheduleResponseDto {
    return {
      date: params.date.date,
      dayOfWeek: params.date.dayOfWeek,
      items: params.entries.map((entry) =>
        this.presentItem(entry, params.date.date),
      ),
    };
  }

  static presentWeekly(params: {
    week: TeacherScheduleWeek;
    entries: TeacherScheduleEntryRecord[];
  }): TeacherWeeklyScheduleResponseDto {
    return {
      weekStartDate: params.week.weekStartDate,
      weekEndDate: params.week.weekEndDate,
      days: params.week.days.map((day) => ({
        date: day.date,
        dayOfWeek: day.dayOfWeek,
        items: params.entries
          .filter(
            (entry) =>
              entry.dayOfWeek === day.dayOfWeek &&
              entryTermContainsDate(entry, day.date),
          )
          .map((entry) => this.presentItem(entry, day.date)),
      })),
    };
  }

  private static presentItem(
    entry: TeacherScheduleEntryRecord,
    date: string,
  ): TeacherScheduleItemDto {
    // Stable V1 read identity only. This is not a persisted ScheduleOccurrence.
    const scheduleId = `timetable-entry:${entry.id}:${date}`;
    const classId = entry.teacherSubjectAllocationId;

    return {
      scheduleId,
      timetableEntryId: entry.id,
      teacherSubjectAllocationId: entry.teacherSubjectAllocationId,
      classId,
      period: {
        id: entry.period.id,
        index: entry.period.periodIndex,
        label: entry.period.label,
        startTime: entry.period.startTime,
        endTime: entry.period.endTime,
      },
      subject: {
        id: entry.subject.id,
        name: localizedName(entry.subject),
        nameAr: entry.subject.nameAr,
        nameEn: entry.subject.nameEn,
        code: entry.subject.code ?? null,
      },
      classroom: {
        id: entry.classroom.id,
        name: localizedName(entry.classroom),
        nameAr: entry.classroom.nameAr,
        nameEn: entry.classroom.nameEn,
      },
      room: entry.room
        ? {
            id: entry.room.id,
            name: localizedName(entry.room),
            nameAr: entry.room.nameAr,
            nameEn: entry.room.nameEn,
          }
        : null,
      notes: entry.notes ?? null,
      status: 'scheduled',
      needsAttendance: entry.period.isInstructional,
      isPrepared: null,
      hasHomework: null,
    };
  }
}

function localizedName(value: {
  nameEn?: string | null;
  nameAr?: string | null;
}): string {
  return value.nameEn ?? value.nameAr ?? '';
}

function entryTermContainsDate(
  entry: TeacherScheduleEntryRecord,
  date: string,
): boolean {
  const term = entry.timetableConfig.term;

  if (term.deletedAt) return false;

  return (
    formatDateOnly(term.startDate) <= date && formatDateOnly(term.endDate) >= date
  );
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

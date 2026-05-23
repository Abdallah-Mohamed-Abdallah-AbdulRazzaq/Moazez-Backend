import { TimetablePeriodType } from '@prisma/client';
import type {
  StudentScheduleDate,
  StudentScheduleWeek,
} from '../application/student-schedule-date';
import type {
  StudentDailyScheduleResponseDto,
  StudentScheduleItemDto,
  StudentWeeklyScheduleResponseDto,
} from '../dto/student-schedule.dto';
import type { StudentScheduleEntryRecord } from '../infrastructure/student-schedule-read.adapter';

export class StudentSchedulePresenter {
  static presentDaily(params: {
    date: StudentScheduleDate;
    entries: StudentScheduleEntryRecord[];
  }): StudentDailyScheduleResponseDto {
    return {
      date: params.date.date,
      dayOfWeek: params.date.dayOfWeek,
      items: params.entries.map((entry) =>
        this.presentItem(entry, params.date.date),
      ),
    };
  }

  static presentWeekly(params: {
    week: StudentScheduleWeek;
    entries: StudentScheduleEntryRecord[];
  }): StudentWeeklyScheduleResponseDto {
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
    entry: StudentScheduleEntryRecord,
    date: string,
  ): StudentScheduleItemDto {
    // Stable V1 read identity only. This is not a persisted ScheduleOccurrence.
    const scheduleId = `timetable-entry:${entry.id}:${date}`;

    return {
      scheduleId,
      timetableEntryId: entry.id,
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
      teacher: {
        id: entry.teacherUser.id,
        fullName: fullName(entry.teacherUser),
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
      hasHomework: null,
      isExam: null,
      isBreak:
        entry.period.type === TimetablePeriodType.BREAK ||
        !entry.period.isInstructional,
    };
  }
}

function localizedName(value: {
  nameEn?: string | null;
  nameAr?: string | null;
}): string {
  return value.nameEn ?? value.nameAr ?? '';
}

function fullName(user: {
  firstName?: string | null;
  lastName?: string | null;
}): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
}

function entryTermContainsDate(
  entry: StudentScheduleEntryRecord,
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

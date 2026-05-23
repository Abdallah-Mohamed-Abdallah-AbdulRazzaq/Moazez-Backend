import { TimetablePeriodType } from '@prisma/client';
import type {
  ParentScheduleDate,
  ParentScheduleWeek,
} from '../application/parent-schedule-date';
import type {
  ParentChildTodayScheduleResponseDto,
  ParentChildWeeklyScheduleResponseDto,
  ParentScheduleChildDto,
  ParentScheduleItemDto,
} from '../dto/parent-schedule.dto';
import type {
  ParentScheduleChildRecord,
  ParentScheduleEntryRecord,
} from '../infrastructure/parent-schedule-read.adapter';

export class ParentSchedulePresenter {
  static presentToday(params: {
    date: ParentScheduleDate;
    child: ParentScheduleChildRecord;
    entries: ParentScheduleEntryRecord[];
  }): ParentChildTodayScheduleResponseDto {
    return {
      date: params.date.date,
      dayOfWeek: params.date.dayOfWeek,
      child: presentChild(params.child),
      items: params.entries.map((entry) =>
        this.presentItem(entry, params.date.date),
      ),
    };
  }

  static presentWeekly(params: {
    week: ParentScheduleWeek;
    child: ParentScheduleChildRecord;
    entries: ParentScheduleEntryRecord[];
  }): ParentChildWeeklyScheduleResponseDto {
    return {
      weekStartDate: params.week.weekStartDate,
      weekEndDate: params.week.weekEndDate,
      child: presentChild(params.child),
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
    entry: ParentScheduleEntryRecord,
    date: string,
  ): ParentScheduleItemDto {
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

function presentChild(
  child: ParentScheduleChildRecord,
): ParentScheduleChildDto {
  return {
    id: child.studentId,
    displayName: `${child.student.firstName} ${child.student.lastName}`.trim(),
  };
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
  entry: ParentScheduleEntryRecord,
  date: string,
): boolean {
  const term = entry.timetableConfig.term;

  if (term.deletedAt) return false;

  return (
    formatDateOnly(term.startDate) <= date &&
    formatDateOnly(term.endDate) >= date
  );
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

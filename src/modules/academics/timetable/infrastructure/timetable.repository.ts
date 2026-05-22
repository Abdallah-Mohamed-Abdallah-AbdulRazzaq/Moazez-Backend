import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TimetableEntryStatus,
  TimetableScopeType,
} from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ACADEMIC_YEAR_ARGS = Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    isActive: true,
  },
});

const TERM_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    academicYearId: true,
    isActive: true,
  },
});

const GRADE_ARGS = Prisma.validator<Prisma.GradeDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
  },
});

const SECTION_ARGS = Prisma.validator<Prisma.SectionDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    gradeId: true,
  },
});

const CLASSROOM_ARGS = Prisma.validator<Prisma.ClassroomDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    sectionId: true,
    nameAr: true,
    nameEn: true,
    section: {
      select: {
        id: true,
        gradeId: true,
      },
    },
  },
});

const ROOM_ARGS = Prisma.validator<Prisma.RoomDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
  },
});

const TEACHER_ALLOCATION_ARGS =
  Prisma.validator<Prisma.TeacherSubjectAllocationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      teacherUserId: true,
      subjectId: true,
      classroomId: true,
      termId: true,
    },
  });

const TIMETABLE_CONFIG_ARGS =
  Prisma.validator<Prisma.TimetableConfigDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      name: true,
      weekStartDay: true,
      activeDays: true,
      scopeType: true,
      scopeKey: true,
      gradeId: true,
      sectionId: true,
      classroomId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const TIMETABLE_PERIOD_ARGS =
  Prisma.validator<Prisma.TimetablePeriodDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      timetableConfigId: true,
      periodIndex: true,
      label: true,
      startTime: true,
      endTime: true,
      type: true,
      isInstructional: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const TIMETABLE_ENTRY_ARGS =
  Prisma.validator<Prisma.TimetableEntryDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      timetableConfigId: true,
      periodId: true,
      dayOfWeek: true,
      gradeId: true,
      sectionId: true,
      classroomId: true,
      subjectId: true,
      teacherUserId: true,
      teacherSubjectAllocationId: true,
      roomId: true,
      notes: true,
      status: true,
      period: {
        select: {
          id: true,
          periodIndex: true,
          label: true,
          startTime: true,
          endTime: true,
        },
      },
      classroom: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
        },
      },
      subject: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          code: true,
        },
      },
      teacherUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      room: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  });

const TIMETABLE_CONFLICT_ARGS =
  Prisma.validator<Prisma.TimetableConflictDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      timetableConfigId: true,
      entryId: true,
      relatedEntryId: true,
      conflictType: true,
      severity: true,
      status: true,
      dayOfWeek: true,
      periodId: true,
      teacherUserId: true,
      roomId: true,
      message: true,
      fingerprint: true,
      detectedAt: true,
      resolvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

export type TimetableAcademicYearRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_ARGS
>;
export type TimetableTermRecord = Prisma.TermGetPayload<typeof TERM_ARGS>;
export type TimetableGradeRecord = Prisma.GradeGetPayload<typeof GRADE_ARGS>;
export type TimetableSectionRecord = Prisma.SectionGetPayload<
  typeof SECTION_ARGS
>;
export type TimetableClassroomRecord = Prisma.ClassroomGetPayload<
  typeof CLASSROOM_ARGS
>;
export type TimetableRoomRecord = Prisma.RoomGetPayload<typeof ROOM_ARGS>;
export type TimetableTeacherAllocationRecord =
  Prisma.TeacherSubjectAllocationGetPayload<typeof TEACHER_ALLOCATION_ARGS>;
export type TimetableConfigRecord = Prisma.TimetableConfigGetPayload<
  typeof TIMETABLE_CONFIG_ARGS
>;
export type TimetablePeriodRecord = Prisma.TimetablePeriodGetPayload<
  typeof TIMETABLE_PERIOD_ARGS
>;
export type TimetableEntryRecord = Prisma.TimetableEntryGetPayload<
  typeof TIMETABLE_ENTRY_ARGS
>;
export type TimetableConflictRecord = Prisma.TimetableConflictGetPayload<
  typeof TIMETABLE_CONFLICT_ARGS
>;

export type DeleteTimetablePeriodResult =
  | { status: 'deleted' }
  | { status: 'not_found' }
  | { status: 'in_use'; entryCount: number };

export type DeleteTimetableEntryResult =
  | { status: 'deleted' }
  | { status: 'not_found' };

export interface ListTimetableEntriesFilters {
  timetableConfigId: string;
  classroomId?: string;
  teacherUserId?: string;
  subjectId?: string;
  roomId?: string;
  dayOfWeek?: number;
  status?: TimetableEntryStatus;
}

@Injectable()
export class TimetableRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error(
        'TimetableRepository requires an active school membership',
      );
    }

    return schoolId;
  }

  findAcademicYearById(
    academicYearId: string,
  ): Promise<TimetableAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findTermById(termId: string): Promise<TimetableTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_ARGS,
    });
  }

  findGradeById(gradeId: string): Promise<TimetableGradeRecord | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id: gradeId },
      ...GRADE_ARGS,
    });
  }

  findSectionById(sectionId: string): Promise<TimetableSectionRecord | null> {
    return this.scopedPrisma.section.findFirst({
      where: { id: sectionId },
      ...SECTION_ARGS,
    });
  }

  findClassroomById(
    classroomId: string,
  ): Promise<TimetableClassroomRecord | null> {
    return this.scopedPrisma.classroom.findFirst({
      where: { id: classroomId },
      ...CLASSROOM_ARGS,
    });
  }

  findRoomById(roomId: string): Promise<TimetableRoomRecord | null> {
    return this.scopedPrisma.room.findFirst({
      where: { id: roomId },
      ...ROOM_ARGS,
    });
  }

  findTeacherAllocationById(
    allocationId: string,
  ): Promise<TimetableTeacherAllocationRecord | null> {
    return this.scopedPrisma.teacherSubjectAllocation.findFirst({
      where: { id: allocationId },
      ...TEACHER_ALLOCATION_ARGS,
    });
  }

  findConfigByScope(input: {
    academicYearId: string;
    termId: string;
    scopeType: TimetableScopeType;
    scopeKey: string;
  }): Promise<TimetableConfigRecord | null> {
    return this.scopedPrisma.timetableConfig.findFirst({
      where: {
        academicYearId: input.academicYearId,
        termId: input.termId,
        scopeType: input.scopeType,
        scopeKey: input.scopeKey,
      },
      ...TIMETABLE_CONFIG_ARGS,
    });
  }

  findConfigById(
    timetableConfigId: string,
  ): Promise<TimetableConfigRecord | null> {
    return this.scopedPrisma.timetableConfig.findFirst({
      where: { id: timetableConfigId },
      ...TIMETABLE_CONFIG_ARGS,
    });
  }

  createConfig(
    data: Prisma.TimetableConfigUncheckedCreateInput,
  ): Promise<TimetableConfigRecord> {
    return this.scopedPrisma.timetableConfig.create({
      data,
      ...TIMETABLE_CONFIG_ARGS,
    });
  }

  updateConfig(
    timetableConfigId: string,
    data: Prisma.TimetableConfigUncheckedUpdateInput,
  ): Promise<TimetableConfigRecord> {
    return this.scopedPrisma.timetableConfig.update({
      where: { id: timetableConfigId },
      data,
      ...TIMETABLE_CONFIG_ARGS,
    });
  }

  listPeriods(timetableConfigId: string): Promise<TimetablePeriodRecord[]> {
    return this.scopedPrisma.timetablePeriod.findMany({
      where: { timetableConfigId },
      orderBy: [{ periodIndex: 'asc' }],
      ...TIMETABLE_PERIOD_ARGS,
    });
  }

  findPeriodById(periodId: string): Promise<TimetablePeriodRecord | null> {
    return this.scopedPrisma.timetablePeriod.findFirst({
      where: { id: periodId },
      ...TIMETABLE_PERIOD_ARGS,
    });
  }

  findPeriodByIndex(input: {
    timetableConfigId: string;
    periodIndex: number;
  }): Promise<TimetablePeriodRecord | null> {
    return this.scopedPrisma.timetablePeriod.findFirst({
      where: {
        timetableConfigId: input.timetableConfigId,
        periodIndex: input.periodIndex,
      },
      ...TIMETABLE_PERIOD_ARGS,
    });
  }

  createPeriod(
    data: Prisma.TimetablePeriodUncheckedCreateInput,
  ): Promise<TimetablePeriodRecord> {
    return this.scopedPrisma.timetablePeriod.create({
      data,
      ...TIMETABLE_PERIOD_ARGS,
    });
  }

  updatePeriod(
    periodId: string,
    data: Prisma.TimetablePeriodUncheckedUpdateInput,
  ): Promise<TimetablePeriodRecord> {
    return this.scopedPrisma.timetablePeriod.update({
      where: { id: periodId },
      data,
      ...TIMETABLE_PERIOD_ARGS,
    });
  }

  async deletePeriod(periodId: string): Promise<DeleteTimetablePeriodResult> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction(async (tx) => {
      const period = await tx.timetablePeriod.findFirst({
        where: { id: periodId, schoolId },
        select: { id: true },
      });
      if (!period) {
        return { status: 'not_found' };
      }

      const entryCount = await tx.timetableEntry.count({
        where: { periodId, schoolId },
      });
      if (entryCount > 0) {
        return { status: 'in_use', entryCount };
      }

      await tx.timetablePeriod.delete({
        where: {
          id_schoolId: {
            id: periodId,
            schoolId,
          },
        },
      });

      return { status: 'deleted' };
    });
  }

  listEntriesForConfig(
    timetableConfigId: string,
  ): Promise<TimetableEntryRecord[]> {
    return this.listEntries({ timetableConfigId });
  }

  listEntries(
    filters: ListTimetableEntriesFilters,
  ): Promise<TimetableEntryRecord[]> {
    return this.scopedPrisma.timetableEntry.findMany({
      where: {
        timetableConfigId: filters.timetableConfigId,
        ...(filters.classroomId ? { classroomId: filters.classroomId } : {}),
        ...(filters.teacherUserId
          ? { teacherUserId: filters.teacherUserId }
          : {}),
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
        ...(filters.roomId ? { roomId: filters.roomId } : {}),
        ...(filters.dayOfWeek !== undefined
          ? { dayOfWeek: filters.dayOfWeek }
          : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { period: { periodIndex: 'asc' } },
        { createdAt: 'asc' },
      ],
      ...TIMETABLE_ENTRY_ARGS,
    });
  }

  findEntryById(entryId: string): Promise<TimetableEntryRecord | null> {
    return this.scopedPrisma.timetableEntry.findFirst({
      where: { id: entryId },
      ...TIMETABLE_ENTRY_ARGS,
    });
  }

  listEntriesForConflictWindow(input: {
    timetableConfigId: string;
    periodId: string;
    dayOfWeek: number;
    excludeEntryId?: string;
  }): Promise<TimetableEntryRecord[]> {
    return this.scopedPrisma.timetableEntry.findMany({
      where: {
        timetableConfigId: input.timetableConfigId,
        periodId: input.periodId,
        dayOfWeek: input.dayOfWeek,
        status: { not: TimetableEntryStatus.CANCELLED },
        ...(input.excludeEntryId ? { NOT: { id: input.excludeEntryId } } : {}),
      },
      ...TIMETABLE_ENTRY_ARGS,
    });
  }

  createEntry(
    data: Prisma.TimetableEntryUncheckedCreateInput,
  ): Promise<TimetableEntryRecord> {
    return this.scopedPrisma.timetableEntry.create({
      data,
      ...TIMETABLE_ENTRY_ARGS,
    });
  }

  updateEntry(
    entryId: string,
    data: Prisma.TimetableEntryUncheckedUpdateInput,
  ): Promise<TimetableEntryRecord> {
    return this.scopedPrisma.timetableEntry.update({
      where: { id: entryId },
      data,
      ...TIMETABLE_ENTRY_ARGS,
    });
  }

  async deleteEntry(entryId: string): Promise<DeleteTimetableEntryResult> {
    const result = await this.scopedPrisma.timetableEntry.deleteMany({
      where: { id: entryId },
    });

    return result.count > 0 ? { status: 'deleted' } : { status: 'not_found' };
  }

  listPersistedConflicts(
    timetableConfigId: string,
  ): Promise<TimetableConflictRecord[]> {
    return this.scopedPrisma.timetableConflict.findMany({
      where: { timetableConfigId },
      orderBy: [{ detectedAt: 'desc' }],
      ...TIMETABLE_CONFLICT_ARGS,
    });
  }
}

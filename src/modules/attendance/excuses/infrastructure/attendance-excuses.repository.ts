import { Injectable } from '@nestjs/common';
import {
  AttendanceExcuseStatus,
  AttendanceExcuseType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const STUDENT_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
} satisfies Prisma.StudentSelect;

const ATTENDANCE_EXCUSE_REQUEST_ARGS =
  Prisma.validator<Prisma.AttendanceExcuseRequestDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      studentId: true,
      type: true,
      status: true,
      dateFrom: true,
      dateTo: true,
      selectedPeriodKeys: true,
      lateMinutes: true,
      earlyLeaveMinutes: true,
      reasonAr: true,
      reasonEn: true,
      decisionNote: true,
      createdById: true,
      decidedById: true,
      decidedAt: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      student: {
        select: STUDENT_SUMMARY_SELECT,
      },
      linkedSessions: {
        orderBy: { createdAt: 'asc' },
        select: {
          attendanceSessionId: true,
          createdAt: true,
        },
      },
    },
  });

const ACADEMIC_YEAR_REFERENCE_ARGS =
  Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
    select: {
      id: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });

const TERM_REFERENCE_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    academicYearId: true,
    startDate: true,
    endDate: true,
    isActive: true,
  },
});

const STUDENT_REFERENCE_ARGS = Prisma.validator<Prisma.StudentDefaultArgs>()({
  select: STUDENT_SUMMARY_SELECT,
});

export type AttendanceExcuseRequestRecord =
  Prisma.AttendanceExcuseRequestGetPayload<
    typeof ATTENDANCE_EXCUSE_REQUEST_ARGS
  >;
export type AcademicYearReferenceRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_REFERENCE_ARGS
>;
export type TermReferenceRecord = Prisma.TermGetPayload<
  typeof TERM_REFERENCE_ARGS
>;
export type StudentReferenceRecord = Prisma.StudentGetPayload<
  typeof STUDENT_REFERENCE_ARGS
>;

export interface ListAttendanceExcuseRequestsFilters {
  academicYearId?: string;
  termId?: string;
  studentId?: string;
  status?: AttendanceExcuseStatus;
  type?: AttendanceExcuseType;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

export interface CreateAttendanceExcuseRequestData {
  schoolId: string;
  academicYearId: string;
  termId: string;
  studentId: string;
  type: AttendanceExcuseType;
  status: AttendanceExcuseStatus;
  dateFrom: Date;
  dateTo: Date;
  selectedPeriodKeys: string[];
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  reasonAr: string | null;
  reasonEn: string | null;
  createdById: string | null;
}

export interface UpdateAttendanceExcuseRequestData {
  type?: AttendanceExcuseType;
  dateFrom?: Date;
  dateTo?: Date;
  selectedPeriodKeys?: string[];
  lateMinutes?: number | null;
  earlyLeaveMinutes?: number | null;
  reasonAr?: string | null;
  reasonEn?: string | null;
}

@Injectable()
export class AttendanceExcusesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  list(
    filters: ListAttendanceExcuseRequestsFilters,
  ): Promise<AttendanceExcuseRequestRecord[]> {
    return this.scopedPrisma.attendanceExcuseRequest.findMany({
      where: this.buildListWhere(filters),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...ATTENDANCE_EXCUSE_REQUEST_ARGS,
    });
  }

  findById(
    excuseRequestId: string,
  ): Promise<AttendanceExcuseRequestRecord | null> {
    return this.scopedPrisma.attendanceExcuseRequest.findFirst({
      where: { id: excuseRequestId },
      ...ATTENDANCE_EXCUSE_REQUEST_ARGS,
    });
  }

  create(
    data: CreateAttendanceExcuseRequestData,
  ): Promise<AttendanceExcuseRequestRecord> {
    return this.scopedPrisma.attendanceExcuseRequest.create({
      data,
      ...ATTENDANCE_EXCUSE_REQUEST_ARGS,
    });
  }

  update(
    excuseRequestId: string,
    data: UpdateAttendanceExcuseRequestData,
  ): Promise<AttendanceExcuseRequestRecord> {
    return this.scopedPrisma.attendanceExcuseRequest.update({
      where: { id: excuseRequestId },
      data,
      ...ATTENDANCE_EXCUSE_REQUEST_ARGS,
    });
  }

  softDelete(excuseRequestId: string): Promise<AttendanceExcuseRequestRecord> {
    return this.scopedPrisma.attendanceExcuseRequest.update({
      where: { id: excuseRequestId },
      data: { deletedAt: new Date() },
      ...ATTENDANCE_EXCUSE_REQUEST_ARGS,
    });
  }

  async validateAcademicYearAndTerm(
    academicYearId: string,
    termId: string,
  ): Promise<{
    academicYear: AcademicYearReferenceRecord | null;
    term: TermReferenceRecord | null;
  }> {
    const [academicYear, term] = await Promise.all([
      this.findAcademicYearById(academicYearId),
      this.findTermById(termId),
    ]);

    return { academicYear, term };
  }

  findAcademicYearById(
    academicYearId: string,
  ): Promise<AcademicYearReferenceRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_REFERENCE_ARGS,
    });
  }

  findTermById(termId: string): Promise<TermReferenceRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_REFERENCE_ARGS,
    });
  }

  validateStudent(studentId: string): Promise<StudentReferenceRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId },
      ...STUDENT_REFERENCE_ARGS,
    });
  }

  async findLinkedSessionIds(excuseRequestId: string): Promise<string[]> {
    const linkedSessions =
      await this.scopedPrisma.attendanceExcuseRequestSession.findMany({
        where: { attendanceExcuseRequestId: excuseRequestId },
        orderBy: { createdAt: 'asc' },
        select: { attendanceSessionId: true },
      });

    return linkedSessions.map(
      (linkedSession) => linkedSession.attendanceSessionId,
    );
  }

  private buildListWhere(
    filters: ListAttendanceExcuseRequestsFilters,
  ): Prisma.AttendanceExcuseRequestWhereInput {
    const and: Prisma.AttendanceExcuseRequestWhereInput[] = [];

    if (filters.dateFrom) {
      and.push({ dateTo: { gte: filters.dateFrom } });
    }

    if (filters.dateTo) {
      and.push({ dateFrom: { lte: filters.dateTo } });
    }

    const search = filters.search?.trim();
    if (search) {
      and.push({
        OR: [
          { reasonAr: { contains: search, mode: 'insensitive' } },
          { reasonEn: { contains: search, mode: 'insensitive' } },
          { student: { firstName: { contains: search, mode: 'insensitive' } } },
          { student: { lastName: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    return {
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }
}

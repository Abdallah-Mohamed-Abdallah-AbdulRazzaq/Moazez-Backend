import { Injectable } from '@nestjs/common';
import {
  AttendanceExcuseStatus,
  AttendanceExcuseType,
  AttendanceSessionStatus,
  AttendanceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

export const ATTENDANCE_EXCUSE_ATTACHMENT_RESOURCE_TYPE =
  'attendance.excuse_request';

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

const ATTENDANCE_EXCUSE_ATTACHMENT_ARGS =
  Prisma.validator<Prisma.AttachmentDefaultArgs>()({
    select: {
      id: true,
      fileId: true,
      schoolId: true,
      resourceType: true,
      resourceId: true,
      createdById: true,
      createdAt: true,
      file: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
  });

const ATTENDANCE_REVIEW_SESSION_ARGS =
  Prisma.validator<Prisma.AttendanceSessionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      date: true,
      periodKey: true,
      policyId: true,
      policy: {
        select: {
          id: true,
          requireExcuseAttachment: true,
        },
      },
    },
  });

const ATTENDANCE_REVIEW_ENTRY_ARGS =
  Prisma.validator<Prisma.AttendanceEntryDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      sessionId: true,
      studentId: true,
      status: true,
      lateMinutes: true,
      earlyLeaveMinutes: true,
      excuseReason: true,
      note: true,
      updatedAt: true,
      session: {
        select: ATTENDANCE_REVIEW_SESSION_ARGS.select,
      },
    },
  });

export type AttendanceExcuseRequestRecord =
  Prisma.AttendanceExcuseRequestGetPayload<
    typeof ATTENDANCE_EXCUSE_REQUEST_ARGS
  >;
type AttendanceExcuseAttachmentRow = Prisma.AttachmentGetPayload<
  typeof ATTENDANCE_EXCUSE_ATTACHMENT_ARGS
>;
export type AttendanceReviewSessionRecord = Prisma.AttendanceSessionGetPayload<
  typeof ATTENDANCE_REVIEW_SESSION_ARGS
>;
export type AttendanceReviewEntryRecord = Prisma.AttendanceEntryGetPayload<
  typeof ATTENDANCE_REVIEW_ENTRY_ARGS
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
export interface AttendanceExcuseAttachmentRecord {
  id: string;
  fileId: string;
  schoolId: string;
  resourceType: string;
  resourceId: string;
  createdById: string | null;
  createdAt: Date;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint;
  };
}

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

export interface ReviewAttendanceExcuseRequestData {
  status: Extract<AttendanceExcuseStatus, 'APPROVED' | 'REJECTED'>;
  decidedById: string | null;
  decidedAt: Date;
  decisionNote: string | null;
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

  async findScopedFileIds(fileIds: string[]): Promise<string[]> {
    if (fileIds.length === 0) return [];

    const files = await this.scopedPrisma.file.findMany({
      where: { id: { in: fileIds } },
      select: { id: true },
    });

    return files.map((file) => file.id);
  }

  async listAttachmentsForExcuseRequest(
    excuseRequestId: string,
  ): Promise<AttendanceExcuseAttachmentRecord[]> {
    const attachments = await this.scopedPrisma.attachment.findMany({
      where: {
        resourceType: ATTENDANCE_EXCUSE_ATTACHMENT_RESOURCE_TYPE,
        resourceId: excuseRequestId,
      },
      orderBy: { createdAt: 'asc' },
      ...ATTENDANCE_EXCUSE_ATTACHMENT_ARGS,
    });

    return attachments.map((attachment) =>
      this.mapAttachmentRecord(attachment),
    );
  }

  async countAttachmentsForExcuseRequests(
    excuseRequestIds: string[],
  ): Promise<Map<string, number>> {
    if (excuseRequestIds.length === 0) return new Map();

    const counts = await this.scopedPrisma.attachment.groupBy({
      by: ['resourceId'],
      where: {
        resourceType: ATTENDANCE_EXCUSE_ATTACHMENT_RESOURCE_TYPE,
        resourceId: { in: excuseRequestIds },
      },
      _count: { _all: true },
    });

    return new Map(
      counts.map((count) => [count.resourceId, count._count._all]),
    );
  }

  async countAttachmentsForExcuseRequest(
    excuseRequestId: string,
  ): Promise<number> {
    return this.scopedPrisma.attachment.count({
      where: {
        resourceType: ATTENDANCE_EXCUSE_ATTACHMENT_RESOURCE_TYPE,
        resourceId: excuseRequestId,
      },
    });
  }

  async linkFilesToExcuseRequest(params: {
    excuseRequestId: string;
    fileIds: string[];
    schoolId: string;
    createdById: string | null;
  }): Promise<AttendanceExcuseAttachmentRecord[]> {
    await this.scopedPrisma.attachment.createMany({
      data: params.fileIds.map((fileId) => ({
        fileId,
        schoolId: params.schoolId,
        resourceType: ATTENDANCE_EXCUSE_ATTACHMENT_RESOURCE_TYPE,
        resourceId: params.excuseRequestId,
        createdById: params.createdById,
      })),
      skipDuplicates: true,
    });

    const attachments = await this.scopedPrisma.attachment.findMany({
      where: {
        resourceType: ATTENDANCE_EXCUSE_ATTACHMENT_RESOURCE_TYPE,
        resourceId: params.excuseRequestId,
        fileId: { in: params.fileIds },
      },
      orderBy: { createdAt: 'asc' },
      ...ATTENDANCE_EXCUSE_ATTACHMENT_ARGS,
    });

    return attachments.map((attachment) =>
      this.mapAttachmentRecord(attachment),
    );
  }

  async findAttachmentForExcuseRequest(params: {
    excuseRequestId: string;
    attachmentId: string;
  }): Promise<AttendanceExcuseAttachmentRecord | null> {
    const attachment = await this.scopedPrisma.attachment.findFirst({
      where: {
        id: params.attachmentId,
        resourceType: ATTENDANCE_EXCUSE_ATTACHMENT_RESOURCE_TYPE,
        resourceId: params.excuseRequestId,
      },
      ...ATTENDANCE_EXCUSE_ATTACHMENT_ARGS,
    });

    return attachment ? this.mapAttachmentRecord(attachment) : null;
  }

  async deleteAttachmentForExcuseRequest(params: {
    excuseRequestId: string;
    attachmentId: string;
  }): Promise<{ status: 'deleted' | 'not_found' }> {
    const result = await this.scopedPrisma.attachment.deleteMany({
      where: {
        id: params.attachmentId,
        resourceType: ATTENDANCE_EXCUSE_ATTACHMENT_RESOURCE_TYPE,
        resourceId: params.excuseRequestId,
      },
    });

    return result.count > 0 ? { status: 'deleted' } : { status: 'not_found' };
  }

  findMatchingSubmittedSessions(params: {
    request: AttendanceExcuseRequestRecord;
  }): Promise<AttendanceReviewSessionRecord[]> {
    const selectedPeriodKeys = params.request.selectedPeriodKeys;

    return this.scopedPrisma.attendanceSession.findMany({
      where: {
        academicYearId: params.request.academicYearId,
        termId: params.request.termId,
        status: AttendanceSessionStatus.SUBMITTED,
        date: {
          gte: params.request.dateFrom,
          lte: params.request.dateTo,
        },
        ...(selectedPeriodKeys.length > 0
          ? { periodKey: { in: selectedPeriodKeys } }
          : {}),
      },
      orderBy: [{ date: 'asc' }, { periodKey: 'asc' }, { id: 'asc' }],
      ...ATTENDANCE_REVIEW_SESSION_ARGS,
    });
  }

  findMatchingEntriesForExcuse(params: {
    sessionIds: string[];
    studentId: string;
    expectedStatus: AttendanceStatus;
  }): Promise<AttendanceReviewEntryRecord[]> {
    if (params.sessionIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.attendanceEntry.findMany({
      where: {
        sessionId: { in: params.sessionIds },
        studentId: params.studentId,
        status: params.expectedStatus,
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      ...ATTENDANCE_REVIEW_ENTRY_ARGS,
    });
  }

  async approveRequestAndApplyEntries(params: {
    excuseRequestId: string;
    schoolId: string;
    review: ReviewAttendanceExcuseRequestData;
    affectedSessionIds: string[];
    affectedEntryIds: string[];
    studentId: string;
    expectedStatus: AttendanceStatus;
    excuseReason: string | null;
  }): Promise<AttendanceExcuseRequestRecord> {
    const updated = await this.scopedPrisma.$transaction(async (tx) => {
      await tx.attendanceExcuseRequest.update({
        where: {
          id_schoolId: {
            id: params.excuseRequestId,
            schoolId: params.schoolId,
          },
        },
        data: {
          status: params.review.status,
          decidedById: params.review.decidedById,
          decidedAt: params.review.decidedAt,
          decisionNote: params.review.decisionNote,
        },
      });

      await tx.attendanceExcuseRequestSession.createMany({
        data: params.affectedSessionIds.map((sessionId) => ({
          schoolId: params.schoolId,
          attendanceExcuseRequestId: params.excuseRequestId,
          attendanceSessionId: sessionId,
        })),
        skipDuplicates: true,
      });

      await tx.attendanceEntry.updateMany({
        where: {
          schoolId: params.schoolId,
          id: { in: params.affectedEntryIds },
          sessionId: { in: params.affectedSessionIds },
          studentId: params.studentId,
          status: params.expectedStatus,
        },
        data: {
          status: AttendanceStatus.EXCUSED,
          excuseReason: params.excuseReason,
        },
      });

      return tx.attendanceExcuseRequest.findFirst({
        where: { id: params.excuseRequestId, schoolId: params.schoolId },
        ...ATTENDANCE_EXCUSE_REQUEST_ARGS,
      });
    });

    if (!updated) {
      throw new Error('Approved attendance excuse request was not found');
    }

    return updated;
  }

  async rejectRequest(params: {
    excuseRequestId: string;
    review: ReviewAttendanceExcuseRequestData;
  }): Promise<AttendanceExcuseRequestRecord> {
    return this.scopedPrisma.attendanceExcuseRequest.update({
      where: { id: params.excuseRequestId },
      data: {
        status: params.review.status,
        decidedById: params.review.decidedById,
        decidedAt: params.review.decidedAt,
        decisionNote: params.review.decisionNote,
      },
      ...ATTENDANCE_EXCUSE_REQUEST_ARGS,
    });
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

  private mapAttachmentRecord(
    attachment: AttendanceExcuseAttachmentRow,
  ): AttendanceExcuseAttachmentRecord {
    return {
      id: attachment.id,
      fileId: attachment.fileId,
      schoolId: attachment.schoolId,
      resourceType: attachment.resourceType,
      resourceId: attachment.resourceId,
      createdById: attachment.createdById,
      createdAt: attachment.createdAt,
      file: {
        id: attachment.file.id,
        originalName: attachment.file.originalName,
        mimeType: attachment.file.mimeType,
        sizeBytes: attachment.file.sizeBytes,
      },
    };
  }
}

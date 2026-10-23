import { Injectable } from '@nestjs/common';
import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkTargetMode,
  HomeworkTargetStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { PrivateMediaFileDescriptor } from '../../../../infrastructure/storage/private-media-content.service';
import type { TeacherHomeworkOwnedClassContext } from '../application/teacher-homework-ownership.service';

const DASHBOARD_ASSIGNMENT_SELECT = {
  id: true,
  teacherSubjectAllocationId: true,
  title: true,
  description: true,
  mode: true,
  status: true,
  targetMode: true,
  dueAt: true,
  targets: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.HomeworkAssignmentSelect;

const ACADEMIC_YEAR_REFERENCE_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
} satisfies Prisma.AcademicYearSelect;

export type TeacherHomeworkDashboardAssignmentRecord =
  Prisma.HomeworkAssignmentGetPayload<{
    select: typeof DASHBOARD_ASSIGNMENT_SELECT;
  }>;

export type TeacherHomeworkAcademicYearReferenceRecord =
  Prisma.AcademicYearGetPayload<{
    select: typeof ACADEMIC_YEAR_REFERENCE_SELECT;
  }>;

@Injectable()
export class TeacherHomeworksReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async findOwnedAssignmentBoundary(params: {
    teacherUserId: string;
    classId: string;
    homeworkId: string;
  }): Promise<{ id: string } | null> {
    return this.scopedPrisma.homeworkAssignment.findFirst({
      where: {
        id: params.homeworkId,
        teacherUserId: params.teacherUserId,
        teacherSubjectAllocationId: params.classId,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  async findSubmissionAttachmentContent(
    params: TeacherHomeworkOwnedClassContext & {
      homeworkId: string;
      submissionId: string;
      attachmentId: string;
    },
  ): Promise<PrivateMediaFileDescriptor | null> {
    const { allocation } = params;
    if (!allocation.term) return null;
    const submission = await this.scopedPrisma.homeworkSubmission.findFirst({
      where: {
        id: params.submissionId,
        schoolId: allocation.schoolId,
        homeworkAssignmentId: params.homeworkId,
        status: { in: ['SUBMITTED', 'LATE', 'REVIEWED'] },
        homeworkTarget: {
          is: { status: { in: ['SUBMITTED', 'LATE', 'REVIEWED'] } },
        },
        homeworkAssignment: {
          is: {
            deletedAt: null,
            status: { in: ['PUBLISHED', 'CLOSED'] },
            teacherUserId: params.teacherUserId,
            teacherSubjectAllocationId: allocation.id,
            classroomId: allocation.classroomId,
            subjectId: allocation.subjectId,
            termId: allocation.termId,
            academicYearId: allocation.term.academicYearId,
          },
        },
        student: { is: { deletedAt: null, status: 'ACTIVE' } },
        enrollment: {
          is: {
            schoolId: allocation.schoolId,
            status: 'ACTIVE',
            deletedAt: null,
            endedAt: null,
            classroomId: allocation.classroomId,
            academicYearId: allocation.term.academicYearId,
            OR: [{ termId: allocation.termId }, { termId: null }],
          },
        },
      },
      select: {
        studentId: true,
        enrollmentId: true,
        homeworkTargetId: true,
        student: { select: { userId: true } },
        enrollment: { select: { studentId: true } },
        homeworkTarget: {
          select: {
            homeworkAssignmentId: true,
            studentId: true,
            enrollmentId: true,
          },
        },
      },
    });
    if (
      !submission ||
      !submission.student.userId ||
      submission.enrollment.studentId !== submission.studentId ||
      submission.homeworkTarget.studentId !== submission.studentId ||
      submission.homeworkTarget.enrollmentId !== submission.enrollmentId ||
      submission.homeworkTarget.homeworkAssignmentId !== params.homeworkId
    )
      return null;

    const attachment =
      await this.scopedPrisma.homeworkSubmissionAttachment.findFirst({
        where: {
          id: params.attachmentId,
          schoolId: allocation.schoolId,
          homeworkAssignmentId: params.homeworkId,
          homeworkSubmissionId: params.submissionId,
          homeworkTargetId: submission.homeworkTargetId,
          createdByUserId: submission.student.userId,
          deletedAt: null,
          file: {
            is: {
              schoolId: allocation.schoolId,
              uploaderId: submission.student.userId,
              visibility: 'PRIVATE',
              deletedAt: null,
              studentCredentialSecretArtifacts: { none: {} },
            },
          },
        },
        select: {
          file: {
            select: {
              bucket: true,
              objectKey: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
            },
          },
        },
      });
    const file = attachment?.file;
    return file && file.bucket && file.objectKey && file.sizeBytes > 0n
      ? file
      : null;
  }

  listDashboardAssignments(params: {
    teacherUserId: string;
    allocationIds: string[];
  }): Promise<TeacherHomeworkDashboardAssignmentRecord[]> {
    if (params.allocationIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.scopedPrisma.homeworkAssignment.findMany({
      where: {
        teacherUserId: params.teacherUserId,
        teacherSubjectAllocationId: { in: params.allocationIds },
        deletedAt: null,
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: DASHBOARD_ASSIGNMENT_SELECT,
    });
  }

  listAcademicYearReferences(
    academicYearIds: string[],
  ): Promise<TeacherHomeworkAcademicYearReferenceRecord[]> {
    const ids = [...new Set(academicYearIds.filter(Boolean))];
    if (ids.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.academicYear.findMany({
      where: { id: { in: ids }, deletedAt: null },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      select: ACADEMIC_YEAR_REFERENCE_SELECT,
    });
  }
}

export function createEmptyTeacherHomeworkTargetCounters(): Record<
  HomeworkTargetStatus,
  number
> {
  return {
    [HomeworkTargetStatus.ASSIGNED]: 0,
    [HomeworkTargetStatus.VIEWED]: 0,
    [HomeworkTargetStatus.SUBMITTED]: 0,
    [HomeworkTargetStatus.LATE]: 0,
    [HomeworkTargetStatus.MISSING]: 0,
    [HomeworkTargetStatus.REVIEWED]: 0,
    [HomeworkTargetStatus.EXCUSED]: 0,
  };
}

export function createEmptyTeacherHomeworkAssignmentCounters(): Record<
  HomeworkAssignmentStatus,
  number
> {
  return {
    [HomeworkAssignmentStatus.DRAFT]: 0,
    [HomeworkAssignmentStatus.PUBLISHED]: 0,
    [HomeworkAssignmentStatus.CLOSED]: 0,
    [HomeworkAssignmentStatus.CANCELLED]: 0,
    [HomeworkAssignmentStatus.ARCHIVED]: 0,
  };
}

export type TeacherHomeworkDashboardMode = HomeworkAssignmentMode;
export type TeacherHomeworkDashboardTargetMode = HomeworkTargetMode;

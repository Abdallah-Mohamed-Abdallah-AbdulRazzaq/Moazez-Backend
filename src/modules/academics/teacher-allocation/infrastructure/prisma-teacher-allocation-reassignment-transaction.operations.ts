import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  HomeworkAssignmentStatus,
  LessonPlanStatus,
  Prisma,
  TimetableEntryStatus,
} from '@prisma/client';
import type {
  TeacherAllocationReassignmentHandoffInput,
  TeacherAllocationReassignmentSuccessfulAuditEntry,
} from '../application/teacher-allocation-reassignment.unit-of-work';

@Injectable()
export class PrismaTeacherAllocationReassignmentTransactionOperations {
  async lockAllocation(
    transaction: Prisma.TransactionClient,
    input: { schoolId: string; allocationId: string },
  ): Promise<boolean> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "teacher_subject_allocations"
      WHERE "id" = ${input.allocationId}::uuid
        AND "school_id" = ${input.schoolId}::uuid
      FOR UPDATE
    `);
    return rows.length === 1;
  }

  async handoffTimetable(
    transaction: Prisma.TransactionClient,
    input: TeacherAllocationReassignmentHandoffInput,
  ): Promise<number> {
    const result = await transaction.timetableEntry.updateMany({
      where: {
        schoolId: input.schoolId,
        teacherSubjectAllocationId: input.allocationId,
        teacherUserId: input.previousTeacherUserId,
        status: {
          in: [TimetableEntryStatus.DRAFT, TimetableEntryStatus.ACTIVE],
        },
      },
      data: { teacherUserId: input.newTeacherUserId },
    });
    return result.count;
  }

  async handoffLessonPlans(
    transaction: Prisma.TransactionClient,
    input: TeacherAllocationReassignmentHandoffInput,
  ): Promise<number> {
    const result = await transaction.lessonPlan.updateMany({
      where: {
        schoolId: input.schoolId,
        teacherSubjectAllocationId: input.allocationId,
        teacherUserId: input.previousTeacherUserId,
        deletedAt: null,
        status: { in: [LessonPlanStatus.DRAFT, LessonPlanStatus.ACTIVE] },
      },
      data: { teacherUserId: input.newTeacherUserId },
    });
    return result.count;
  }

  async handoffHomework(
    transaction: Prisma.TransactionClient,
    input: TeacherAllocationReassignmentHandoffInput,
  ): Promise<number> {
    const result = await transaction.homeworkAssignment.updateMany({
      where: {
        schoolId: input.schoolId,
        teacherSubjectAllocationId: input.allocationId,
        teacherUserId: input.previousTeacherUserId,
        deletedAt: null,
        status: {
          in: [
            HomeworkAssignmentStatus.DRAFT,
            HomeworkAssignmentStatus.PUBLISHED,
            HomeworkAssignmentStatus.CLOSED,
          ],
        },
      },
      data: { teacherUserId: input.newTeacherUserId },
    });
    return result.count;
  }

  async handoffAllocation(
    transaction: Prisma.TransactionClient,
    input: TeacherAllocationReassignmentHandoffInput,
  ): Promise<number> {
    const result = await transaction.teacherSubjectAllocation.updateMany({
      where: {
        id: input.allocationId,
        schoolId: input.schoolId,
        teacherUserId: input.previousTeacherUserId,
      },
      data: { teacherUserId: input.newTeacherUserId },
    });
    return result.count;
  }

  async writeSuccessfulAudit(
    transaction: Prisma.TransactionClient,
    entry: TeacherAllocationReassignmentSuccessfulAuditEntry,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        actorId: entry.actorId,
        userType: entry.userType,
        organizationId: entry.organizationId,
        schoolId: entry.schoolId,
        module: 'academics',
        action: 'academics.allocation.reassign',
        resourceType: 'teacher_subject_allocation',
        resourceId: entry.allocationId,
        outcome: AuditOutcome.SUCCESS,
        before: {
          teacherUserId: entry.previousTeacherUserId,
        },
        after: {
          teacherUserId: entry.newTeacherUserId,
          ...(entry.reasonCode ? { reasonCode: entry.reasonCode } : {}),
          transferred: entry.transferred,
          blockersVerified: {
            reinforcement: 0,
            announcements: 0,
          },
        },
      },
      select: { id: true },
    });
  }
}

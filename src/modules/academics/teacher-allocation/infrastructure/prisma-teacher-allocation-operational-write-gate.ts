import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  LockedTeacherAllocation,
  TeacherAllocationOperationalWriteGate,
  TeacherAllocationOperationalWriteGateError,
  TeacherAllocationOperationalWriteGateInput,
} from '../application/teacher-allocation-operational-write-gate';

interface LockedTeacherAllocationRow {
  id: string;
  school_id: string;
  teacher_user_id: string;
  subject_id: string;
  classroom_id: string;
  term_id: string;
}

@Injectable()
export class PrismaTeacherAllocationOperationalWriteGate extends TeacherAllocationOperationalWriteGate {
  async lock(
    transaction: Prisma.TransactionClient,
    input: TeacherAllocationOperationalWriteGateInput,
  ): Promise<LockedTeacherAllocation[]> {
    const allocationIds = [...new Set(input.allocationIds)].sort();

    if (allocationIds.length === 0) return [];

    // PostgreSQL SERIALIZABLE fixes its snapshot at the first statement. A
    // reassignment that begins while a compatible FOR SHARE writer is open can
    // otherwise wait for the row lock and still read the pre-writer snapshot.
    // Serialize gate participants by the same deterministic key order, then
    // create a no-data-change row version after the shared read. That version
    // makes an already-started SERIALIZABLE reassignment fail safely instead of
    // committing against an invisible operational write.
    for (const allocationId of allocationIds) {
      await transaction.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(
            ${input.schoolId}::text || ':' || ${allocationId}::text,
            0
          )
        ) IS NULL AS "locked"
      `);
    }

    const rows = await transaction.$queryRaw<LockedTeacherAllocationRow[]>(
      Prisma.sql`
        SELECT
          "id",
          "school_id",
          "teacher_user_id",
          "subject_id",
          "classroom_id",
          "term_id"
        FROM "teacher_subject_allocations"
        WHERE "school_id" = ${input.schoolId}::uuid
          AND "id" IN (${Prisma.join(allocationIds.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY "id" ASC
        FOR SHARE
      `,
    );

    if (rows.length !== allocationIds.length) {
      throw new TeacherAllocationOperationalWriteGateError(
        'ALLOCATION_NOT_FOUND',
      );
    }

    const allocations = rows.map((row) => ({
      id: row.id,
      schoolId: row.school_id,
      teacherUserId: row.teacher_user_id,
      subjectId: row.subject_id,
      classroomId: row.classroom_id,
      termId: row.term_id,
    }));

    if (
      input.expectedTeacherUserId &&
      allocations.some(
        (allocation) =>
          allocation.teacherUserId !== input.expectedTeacherUserId,
      )
    ) {
      throw new TeacherAllocationOperationalWriteGateError('OWNER_CHANGED');
    }

    const fencedRows = await transaction.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        UPDATE "teacher_subject_allocations"
        SET "teacher_user_id" = "teacher_user_id"
        WHERE "school_id" = ${input.schoolId}::uuid
          AND "id" IN (${Prisma.join(allocationIds.map((id) => Prisma.sql`${id}::uuid`))})
        RETURNING "id"
      `,
    );
    if (fencedRows.length !== allocationIds.length) {
      throw new TeacherAllocationOperationalWriteGateError(
        'ALLOCATION_NOT_FOUND',
      );
    }

    return allocations;
  }
}

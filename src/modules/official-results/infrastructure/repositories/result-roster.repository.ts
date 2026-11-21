import { Injectable } from '@nestjs/common';
import { Prisma, SchoolStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { ResultSheetTarget } from '../../application/result-foundation.types';
import { OfficialResultsError } from '../../domain/official-results.error';
import { assertRosterDate } from '../../domain/reporting-dates';

const rosterLimit = 25_000;
const enrollmentSelect = {
  id: true,
  studentId: true,
  classroomId: true,
  termId: true,
  enrolledAt: true,
  endedAt: true,
} satisfies Prisma.EnrollmentSelect;

type RosterEnrollment = Prisma.EnrollmentGetPayload<{
  select: typeof enrollmentSelect;
}>;

@Injectable()
export class ResultRosterRepository {
  async resolveTarget(
    client: Prisma.TransactionClient,
    schoolId: string,
    target: ResultSheetTarget,
    write = false,
  ) {
    const period = await client.resultReportingPeriod.findFirst({
      where: {
        id: target.reportingPeriodId,
        schoolId,
        academicYear: { deletedAt: null },
        OR: [{ termId: null }, { term: { deletedAt: null } }],
        school: { status: SchoolStatus.ACTIVE, deletedAt: null },
      },
      select: {
        id: true,
        schoolId: true,
        academicYearId: true,
        kind: true,
        termId: true,
        startsOn: true,
        endsOn: true,
        status: true,
        revision: true,
        school: {
          select: { schoolProfile: { select: { timezone: true } } },
        },
      },
    });
    const classroom = await client.classroom.findFirst({
      where: {
        id: target.classroomId,
        schoolId,
        deletedAt: null,
        section: {
          deletedAt: null,
          grade: { deletedAt: null, stage: { deletedAt: null } },
        },
      },
      select: {
        id: true,
        sectionId: true,
        section: {
          select: { gradeId: true, grade: { select: { stageId: true } } },
        },
      },
    });
    const group = await client.resultGroup.findFirst({
      where: {
        id: target.groupId,
        schoolId,
        archivedAt: null,
        OR: [
          { subjectId: null },
          { subject: { deletedAt: null, isActive: true } },
        ],
      },
      select: { id: true, kind: true, subjectId: true, revision: true },
    });
    if (!period || !classroom || !group) throw new NotFoundDomainException();

    if (group.subjectId) {
      const offering = await client.subjectAllocation.findFirst({
        where: {
          schoolId,
          academicYearId: period.academicYearId,
          termId: period.termId ?? undefined,
          gradeId: classroom.section.gradeId,
          subjectId: group.subjectId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!offering)
        throw new OfficialResultsError('scope.subject_unavailable');
      if (write) {
        const locked = await client.$queryRaw<{ id: string }[]>`
          SELECT a.id FROM subject_allocations a
          JOIN subjects s ON s.id = a.subject_id AND s.school_id = a.school_id
          WHERE a.id = ${offering.id}::uuid AND a.school_id = ${schoolId}::uuid
            AND a.deleted_at IS NULL AND s.deleted_at IS NULL AND s.is_active
            AND a.grade_id = ${classroom.section.gradeId}::uuid
            AND a.academic_year_id = ${period.academicYearId}::uuid
            AND (${period.termId}::uuid IS NULL OR a.term_id = ${period.termId}::uuid)
          FOR SHARE OF a, s
        `;
        if (locked.length !== 1)
          throw new OfficialResultsError('scope.subject_unavailable');
      }
    }
    if (write) {
      const locked = await client.$queryRaw<{ id: string }[]>`
        SELECT c.id FROM classrooms c
        JOIN sections se ON se.id = c.section_id AND se.school_id = c.school_id
        JOIN grades gr ON gr.id = se.grade_id AND gr.school_id = c.school_id
        JOIN stages st ON st.id = gr.stage_id AND st.school_id = c.school_id
        JOIN result_groups g ON g.id = ${group.id}::uuid AND g.school_id = c.school_id
        WHERE c.school_id = ${schoolId}::uuid AND c.id = ${classroom.id}::uuid
          AND c.deleted_at IS NULL AND se.deleted_at IS NULL AND gr.deleted_at IS NULL AND st.deleted_at IS NULL
          AND se.id = ${classroom.sectionId}::uuid AND gr.id = ${classroom.section.gradeId}::uuid
          AND st.id = ${classroom.section.grade.stageId}::uuid AND g.archived_at IS NULL
        FOR SHARE OF c, se, gr, st, g
      `;
      if (locked.length !== 1) throw new NotFoundDomainException();
    }

    return { period, classroom, group };
  }

  async placements(
    client: Prisma.TransactionClient,
    period: Awaited<
      ReturnType<ResultRosterRepository['resolveTarget']>
    >['period'],
    rosterAsOf: Date,
    studentIds: string[],
    write = false,
  ) {
    if (studentIds.length === 0) return new Map<string, RosterEnrollment[]>();
    const ids = Prisma.join(studentIds.map((id) => Prisma.sql`${id}::uuid`));
    if (write)
      await client.$queryRaw`
      SELECT id FROM students
      WHERE school_id = ${period.schoolId}::uuid AND id IN (${ids})
      ORDER BY id FOR UPDATE
    `;
    const rows = await client.$queryRaw<RosterEnrollment[]>(Prisma.sql`
      SELECT e.id, e.student_id AS "studentId", e.classroom_id AS "classroomId",
        e.term_id AS "termId", e.enrolled_at AS "enrolledAt", e.ended_at AS "endedAt"
      FROM student_enrollments e
      JOIN students s ON s.id = e.student_id AND s.school_id = e.school_id AND s.deleted_at IS NULL
      WHERE e.school_id = ${period.schoolId}::uuid AND e.academic_year_id = ${period.academicYearId}::uuid
        AND e.student_id IN (${ids}) AND e.deleted_at IS NULL
        AND e.enrolled_at <= ${rosterAsOf} AND (e.ended_at IS NULL OR e.ended_at > ${rosterAsOf})
        AND (${period.termId}::uuid IS NULL OR e.term_id IS NULL OR e.term_id = ${period.termId}::uuid)
      ORDER BY e.student_id, e.id
      ${write ? Prisma.sql`FOR SHARE OF e` : Prisma.empty}
    `);
    const placements = new Map<string, RosterEnrollment[]>();
    for (const row of rows) {
      const list = placements.get(row.studentId) ?? [];
      list.push(row);
      placements.set(row.studentId, list);
    }
    return placements;
  }

  existingPlacements(
    client: Prisma.TransactionClient,
    schoolId: string,
    target: ResultSheetTarget,
    studentIds: string[],
  ) {
    return client.resultSlot.findMany({
      where: {
        schoolId,
        reportingPeriodId: target.reportingPeriodId,
        groupId: target.groupId,
        studentId: { in: studentIds },
      },
      select: { studentId: true, sheetId: true },
      orderBy: { studentId: 'asc' },
    });
  }

  async findRoster(
    client: Prisma.TransactionClient,
    target: Awaited<ReturnType<ResultRosterRepository['resolveTarget']>>,
    rosterAsOf: Date,
    includeAmbiguity = false,
  ): Promise<RosterEnrollment[]> {
    const { period, classroom } = target;
    const timezone = period.school.schoolProfile?.timezone ?? 'UTC';
    assertRosterDate(rosterAsOf, timezone, period);

    // Inspect all eligible placements for students present in this classroom.
    // This detects an overlapping placement in another classroom as well.
    const eligible: Prisma.EnrollmentWhereInput = {
      schoolId: period.schoolId,
      academicYearId: period.academicYearId,
      deletedAt: null,
      enrolledAt: { lte: rosterAsOf },
      AND: [
        { OR: [{ endedAt: null }, { endedAt: { gt: rosterAsOf } }] },
        ...(period.termId
          ? [{ OR: [{ termId: null }, { termId: period.termId }] }]
          : []),
      ],
    };
    const enrollments = await client.enrollment.findMany({
      where: {
        ...eligible,
        student: {
          schoolId: period.schoolId,
          deletedAt: null,
          enrollments: { some: { ...eligible, classroomId: classroom.id } },
        },
      },
      orderBy: [{ studentId: 'asc' }, { id: 'asc' }],
      take: rosterLimit + 1,
      select: enrollmentSelect,
    });
    if (enrollments.length > rosterLimit) {
      throw new OfficialResultsError('roster.limit_exceeded');
    }
    const students = new Set<string>();
    for (const enrollment of enrollments) {
      if (!includeAmbiguity && students.has(enrollment.studentId)) {
        throw new OfficialResultsError('roster.ambiguous');
      }
      students.add(enrollment.studentId);
    }
    return enrollments;
  }
}

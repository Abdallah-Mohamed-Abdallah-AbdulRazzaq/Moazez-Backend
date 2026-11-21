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

    if (group.subjectId && period.termId) {
      const offering = await client.subjectAllocation.findFirst({
        where: {
          schoolId,
          academicYearId: period.academicYearId,
          termId: period.termId,
          gradeId: classroom.section.gradeId,
          subjectId: group.subjectId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!offering)
        throw new OfficialResultsError('scope.subject_unavailable');
    }

    return { period, classroom, group };
  }

  async findRoster(
    client: Prisma.TransactionClient,
    target: Awaited<ReturnType<ResultRosterRepository['resolveTarget']>>,
    rosterAsOf: Date,
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
      if (students.has(enrollment.studentId)) {
        throw new OfficialResultsError('roster.ambiguous');
      }
      students.add(enrollment.studentId);
    }
    return enrollments;
  }
}

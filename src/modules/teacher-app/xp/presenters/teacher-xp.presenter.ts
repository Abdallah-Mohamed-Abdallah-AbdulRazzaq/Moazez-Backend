import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import {
  TeacherXpActivityDto,
  TeacherXpClassResponseDto,
  TeacherXpDashboardResponseDto,
  TeacherXpHistoryResponseDto,
  TeacherXpStudentResponseDto,
} from '../dto/teacher-xp.dto';
import type {
  TeacherXpLedgerRecord,
  TeacherXpOwnedEnrollmentRecord,
} from '../infrastructure/teacher-xp-read.adapter';

export class TeacherXpPresenter {
  static presentDashboard(params: {
    allocations: TeacherAppAllocationRecord[];
    ownedEnrollments: TeacherXpOwnedEnrollmentRecord[];
    ledger: TeacherXpLedgerRecord[];
  }): TeacherXpDashboardResponseDto {
    return {
      summary: presentSummary({
        ownedEnrollments: params.ownedEnrollments,
        ledger: params.ledger,
      }),
      byClass: params.allocations.map((allocation) => {
        const classEnrollments = enrollmentsForAllocation(
          params.ownedEnrollments,
          allocation,
        );
        const classLedger = ledgerForEnrollments(
          params.ledger,
          classEnrollments,
        );

        return {
          classId: allocation.id,
          className: localizedName(allocation.classroom),
          subjectName: localizedName(allocation.subject),
          studentsCount: uniqueStudentIds(classEnrollments).length,
          totalXp: sumLedger(classLedger),
          averageXp: averageXp(classLedger, classEnrollments),
          topStudent: topStudent(classLedger, classEnrollments),
        };
      }),
      recentActivity: params.ledger.slice(0, 10).map(presentActivity),
    };
  }

  static presentClass(params: {
    allocation: TeacherAppAllocationRecord;
    ownedEnrollments: TeacherXpOwnedEnrollmentRecord[];
    ledger: TeacherXpLedgerRecord[];
  }): TeacherXpClassResponseDto {
    const classEnrollments = enrollmentsForAllocation(
      params.ownedEnrollments,
      params.allocation,
    );
    const classLedger = ledgerForEnrollments(params.ledger, classEnrollments);
    const students = uniqueStudents(classEnrollments);

    return {
      classId: params.allocation.id,
      className: localizedName(params.allocation.classroom),
      subjectName: localizedName(params.allocation.subject),
      students: students.map((student) => {
        const studentLedger = classLedger.filter(
          (entry) => entry.studentId === student.studentId,
        );

        return {
          studentId: student.studentId,
          displayName: student.displayName,
          totalXp: sumLedger(studentLedger),
          rank: null,
          tier: null,
          level: null,
          recentActivityCount: studentLedger.length,
        };
      }),
      summary: {
        classId: params.allocation.id,
        className: localizedName(params.allocation.classroom),
        subjectName: localizedName(params.allocation.subject),
        studentsCount: students.length,
        totalXp: sumLedger(classLedger),
        averageXp: averageXp(classLedger, classEnrollments),
        topStudent: topStudent(classLedger, classEnrollments),
      },
    };
  }

  static presentStudent(params: {
    studentId: string;
    ownedEnrollments: TeacherXpOwnedEnrollmentRecord[];
    ledger: TeacherXpLedgerRecord[];
  }): TeacherXpStudentResponseDto {
    const student = uniqueStudents(params.ownedEnrollments).find(
      (item) => item.studentId === params.studentId,
    );
    const studentLedger = params.ledger.filter(
      (entry) => entry.studentId === params.studentId,
    );

    return {
      studentId: params.studentId,
      displayName: student?.displayName ?? '',
      totalXp: sumLedger(studentLedger),
      rank: null,
      tier: null,
      level: null,
      recentActivity: studentLedger.slice(0, 10).map(presentActivity),
    };
  }

  static presentHistory(params: {
    studentId: string;
    ledger: TeacherXpLedgerRecord[];
    pagination: {
      page: number;
      limit: number;
      total: number;
    };
  }): TeacherXpHistoryResponseDto {
    return {
      studentId: params.studentId,
      items: params.ledger.map(presentActivity),
      pagination: params.pagination,
    };
  }
}

function presentSummary(params: {
  ownedEnrollments: TeacherXpOwnedEnrollmentRecord[];
  ledger: TeacherXpLedgerRecord[];
}) {
  const studentsCount = uniqueStudentIds(params.ownedEnrollments).length;

  return {
    studentsCount,
    totalXp: sumLedger(params.ledger),
    averageXp:
      studentsCount > 0 ? round2(sumLedger(params.ledger) / studentsCount) : 0,
    topStudent: topStudent(params.ledger, params.ownedEnrollments),
    recentActivityCount: params.ledger.length,
  };
}

function presentActivity(entry: TeacherXpLedgerRecord): TeacherXpActivityDto {
  return {
    xpId: entry.id,
    studentId: entry.studentId,
    studentName: fullName(entry.student),
    amount: entry.amount,
    sourceType: entry.sourceType.toLowerCase(),
    sourceId: entry.sourceId,
    reason: entry.reason ?? entry.reasonAr,
    occurredAt: entry.occurredAt.toISOString(),
  };
}

function topStudent(
  ledger: TeacherXpLedgerRecord[],
  enrollments: TeacherXpOwnedEnrollmentRecord[],
) {
  const students = uniqueStudents(enrollments);
  if (students.length === 0) return null;

  const totals = new Map<string, number>();
  for (const student of students) {
    totals.set(student.studentId, 0);
  }
  for (const entry of ledger) {
    if (!totals.has(entry.studentId)) continue;
    totals.set(
      entry.studentId,
      (totals.get(entry.studentId) ?? 0) + entry.amount,
    );
  }

  const [top] = students.sort((left, right) => {
    const delta =
      (totals.get(right.studentId) ?? 0) - (totals.get(left.studentId) ?? 0);
    if (delta !== 0) return delta;
    return left.displayName.localeCompare(right.displayName);
  });

  if (!top) return null;

  return {
    studentId: top.studentId,
    displayName: top.displayName,
    totalXp: totals.get(top.studentId) ?? 0,
  };
}

function averageXp(
  ledger: TeacherXpLedgerRecord[],
  enrollments: TeacherXpOwnedEnrollmentRecord[],
): number {
  const studentsCount = uniqueStudentIds(enrollments).length;
  return studentsCount > 0 ? round2(sumLedger(ledger) / studentsCount) : 0;
}

function sumLedger(ledger: TeacherXpLedgerRecord[]): number {
  return ledger.reduce((total, entry) => total + entry.amount, 0);
}

function ledgerForEnrollments(
  ledger: TeacherXpLedgerRecord[],
  enrollments: TeacherXpOwnedEnrollmentRecord[],
): TeacherXpLedgerRecord[] {
  const enrollmentIds = new Set(enrollments.map((enrollment) => enrollment.id));
  const studentTermKeys = new Set(
    enrollments.map(
      (enrollment) =>
        `${enrollment.studentId}:${enrollment.academicYearId}:${enrollment.termId}`,
    ),
  );

  return ledger.filter((entry) => {
    if (entry.enrollmentId) return enrollmentIds.has(entry.enrollmentId);
    return studentTermKeys.has(
      `${entry.studentId}:${entry.academicYearId}:${entry.termId}`,
    );
  });
}

function enrollmentsForAllocation(
  enrollments: TeacherXpOwnedEnrollmentRecord[],
  allocation: TeacherAppAllocationRecord,
): TeacherXpOwnedEnrollmentRecord[] {
  return enrollments.filter(
    (enrollment) =>
      enrollment.classroomId === allocation.classroomId &&
      enrollment.termId === allocation.termId &&
      enrollment.academicYearId === allocation.term?.academicYearId,
  );
}

function uniqueStudents(enrollments: TeacherXpOwnedEnrollmentRecord[]): Array<{
  studentId: string;
  displayName: string;
}> {
  const byStudent = new Map<
    string,
    { studentId: string; displayName: string }
  >();
  for (const enrollment of enrollments) {
    byStudent.set(enrollment.studentId, {
      studentId: enrollment.studentId,
      displayName: fullName(enrollment.student),
    });
  }

  return [...byStudent.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}

function uniqueStudentIds(
  enrollments: TeacherXpOwnedEnrollmentRecord[],
): string[] {
  return [...new Set(enrollments.map((enrollment) => enrollment.studentId))];
}

function localizedName(
  value: { nameEn?: string | null; nameAr?: string | null } | null | undefined,
): string {
  return value?.nameEn ?? value?.nameAr ?? '';
}

function fullName(student: { firstName: string; lastName: string }): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

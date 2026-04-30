import {
  BehaviorReviewPointLedgerRecord,
  BehaviorReviewQueueSummary,
  BehaviorReviewRecord,
} from '../infrastructure/behavior-review.repository';

export function presentBehaviorReviewQueueList(params: {
  items: BehaviorReviewRecord[];
  total: number;
  summary: BehaviorReviewQueueSummary;
  limit?: number | null;
  offset?: number | null;
}) {
  return {
    items: params.items.map((record) => presentBehaviorReviewRecord(record)),
    summary: params.summary,
    total: params.total,
    limit: params.limit ?? null,
    offset: params.offset ?? null,
  };
}

export function presentBehaviorReviewRecord(record: BehaviorReviewRecord) {
  return {
    id: record.id,
    academicYearId: record.academicYearId,
    termId: record.termId,
    studentId: record.studentId,
    enrollmentId: record.enrollmentId,
    categoryId: record.categoryId,
    type: presentEnum(record.type),
    severity: presentEnum(record.severity),
    status: presentEnum(record.status),
    titleEn: record.titleEn,
    titleAr: record.titleAr,
    noteEn: record.noteEn,
    noteAr: record.noteAr,
    points: record.points,
    occurredAt: record.occurredAt.toISOString(),
    createdById: record.createdById,
    submittedById: record.submittedById,
    submittedAt: presentNullableDate(record.submittedAt),
    reviewedById: record.reviewedById,
    reviewedAt: presentNullableDate(record.reviewedAt),
    reviewNoteEn: record.reviewNoteEn,
    reviewNoteAr: record.reviewNoteAr,
    metadata: record.metadata ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    summaries: {
      student: presentStudentSummary(record),
      enrollment: presentEnrollmentSummary(record),
      category: presentCategorySummary(record),
      academicYear: presentAcademicYearSummary(record),
      term: presentTermSummary(record),
      createdBy: presentUserSummary(record.createdBy),
      submittedBy: presentUserSummary(record.submittedBy),
      reviewedBy: presentUserSummary(record.reviewedBy),
    },
    behaviorPointLedgerEntries: record.pointLedgerEntries.map((entry) =>
      presentBehaviorPointLedgerSummary(entry),
    ),
  };
}

export function presentBehaviorReviewApproval(params: {
  record: BehaviorReviewRecord;
  ledger: BehaviorReviewPointLedgerRecord;
}) {
  return {
    record: presentBehaviorReviewRecord(params.record),
    behaviorPointLedger: presentBehaviorPointLedgerSummary(params.ledger),
  };
}

function presentBehaviorPointLedgerSummary(
  ledger: BehaviorReviewPointLedgerRecord,
) {
  return {
    id: ledger.id,
    recordId: ledger.recordId,
    studentId: ledger.studentId,
    enrollmentId: ledger.enrollmentId,
    categoryId: ledger.categoryId,
    entryType: presentEnum(ledger.entryType),
    amount: ledger.amount,
    occurredAt: ledger.occurredAt.toISOString(),
    actorId: ledger.actorId,
  };
}

function presentAcademicYearSummary(record: BehaviorReviewRecord) {
  if (!record.academicYear) return null;

  return {
    id: record.academicYear.id,
    nameEn: record.academicYear.nameEn,
    nameAr: record.academicYear.nameAr,
    startDate: record.academicYear.startDate.toISOString(),
    endDate: record.academicYear.endDate.toISOString(),
    isActive: record.academicYear.isActive,
  };
}

function presentTermSummary(record: BehaviorReviewRecord) {
  if (!record.term) return null;

  return {
    id: record.term.id,
    academicYearId: record.term.academicYearId,
    nameEn: record.term.nameEn,
    nameAr: record.term.nameAr,
    startDate: record.term.startDate.toISOString(),
    endDate: record.term.endDate.toISOString(),
    isActive: record.term.isActive,
  };
}

function presentStudentSummary(record: BehaviorReviewRecord) {
  if (!record.student) return null;

  return {
    id: record.student.id,
    firstName: record.student.firstName,
    lastName: record.student.lastName,
    displayName: `${record.student.firstName} ${record.student.lastName}`,
    status: presentEnum(record.student.status),
  };
}

function presentEnrollmentSummary(record: BehaviorReviewRecord) {
  if (!record.enrollment) return null;

  return {
    id: record.enrollment.id,
    studentId: record.enrollment.studentId,
    academicYearId: record.enrollment.academicYearId,
    termId: record.enrollment.termId,
    classroomId: record.enrollment.classroomId,
    status: presentEnum(record.enrollment.status),
    classroom: record.enrollment.classroom
      ? {
          id: record.enrollment.classroom.id,
          nameEn: record.enrollment.classroom.nameEn,
          nameAr: record.enrollment.classroom.nameAr,
          section: record.enrollment.classroom.section
            ? {
                id: record.enrollment.classroom.section.id,
                nameEn: record.enrollment.classroom.section.nameEn,
                nameAr: record.enrollment.classroom.section.nameAr,
                grade: record.enrollment.classroom.section.grade
                  ? {
                      id: record.enrollment.classroom.section.grade.id,
                      nameEn: record.enrollment.classroom.section.grade.nameEn,
                      nameAr: record.enrollment.classroom.section.grade.nameAr,
                    }
                  : null,
              }
            : null,
        }
      : null,
  };
}

function presentCategorySummary(record: BehaviorReviewRecord) {
  if (!record.category) return null;

  return {
    id: record.category.id,
    code: record.category.code,
    nameEn: record.category.nameEn,
    nameAr: record.category.nameAr,
    type: presentEnum(record.category.type),
    defaultSeverity: presentEnum(record.category.defaultSeverity),
    defaultPoints: record.category.defaultPoints,
    isActive: record.category.isActive,
  };
}

function presentUserSummary(
  user: BehaviorReviewRecord['createdBy'],
): {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  userType: string;
} | null {
  if (!user) return null;

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: `${user.firstName} ${user.lastName}`,
    email: user.email,
    userType: presentEnum(user.userType),
  };
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

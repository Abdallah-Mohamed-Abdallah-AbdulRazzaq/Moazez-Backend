import {
  presentAssessmentApprovalStatus,
  presentDecimal,
  presentGradeItemStatus,
  presentGradeScopeType,
} from '../../shared/presenters/grades.presenter';
import {
  GradebookCellResponseDto,
  GradebookColumnResponseDto,
  GradebookResponseDto,
  GradebookRowResponseDto,
  GradebookRuleResponseDto,
  GradebookScopeResponseDto,
  GradebookStudentResponseDto,
  GradebookSummaryResponseDto,
} from '../dto/get-gradebook-query.dto';
import {
  EffectiveGradesReadRule,
  GradebookCellModel,
  GradebookColumnModel,
  GradebookRowModel,
  GradesGradebookModel,
} from '../../shared/application/grades-read-model.builder';

export function presentGradebook(
  gradebook: GradesGradebookModel,
): GradebookResponseDto {
  return {
    academicYearId: gradebook.academicYearId,
    yearId: gradebook.yearId,
    termId: gradebook.termId,
    subjectId: gradebook.subjectId,
    scope: presentGradebookScope(gradebook.scope),
    rule: presentGradebookRule(gradebook.rule),
    columns: gradebook.columns.map((column) =>
      presentGradebookColumn(column),
    ),
    rows: gradebook.rows.map((row) => presentGradebookRow(row)),
    summary: presentGradebookSummary(gradebook.summary),
  };
}

export function presentGradebookRule(
  rule: EffectiveGradesReadRule,
): GradebookRuleResponseDto {
  return {
    source: rule.source,
    ruleId: rule.ruleId,
    passMark: rule.passMark,
    rounding: String(rule.rounding).toLowerCase(),
    gradingScale: String(rule.gradingScale).toLowerCase(),
  };
}

function presentGradebookScope(
  scope: GradesGradebookModel['scope'],
): GradebookScopeResponseDto {
  return {
    scopeType: presentGradeScopeType(scope.scopeType),
    scopeKey: scope.scopeKey,
    scopeId: scope.scopeKey,
    stageId: scope.stageId,
    gradeId: scope.gradeId,
    sectionId: scope.sectionId,
    classroomId: scope.classroomId,
  };
}

function presentGradebookColumn(
  column: GradebookColumnModel,
): GradebookColumnResponseDto {
  const assessment = column.assessment;
  const title = assessment.titleEn ?? assessment.titleAr ?? null;

  return {
    assessmentId: assessment.id,
    subjectId: assessment.subjectId,
    title,
    titleEn: assessment.titleEn,
    titleAr: assessment.titleAr,
    type: assessment.type,
    date: assessment.date.toISOString().slice(0, 10),
    weight: presentDecimal(assessment.weight) ?? 0,
    maxScore: presentDecimal(assessment.maxScore) ?? 0,
    approvalStatus: presentAssessmentApprovalStatus(
      assessment.approvalStatus,
    ),
    isLocked: Boolean(assessment.lockedAt),
  };
}

function presentGradebookRow(row: GradebookRowModel): GradebookRowResponseDto {
  return {
    studentId: row.enrollment.studentId,
    enrollmentId: row.enrollment.id,
    student: presentGradebookStudent(row.enrollment.student),
    finalPercent: row.finalPercent,
    completedWeight: row.completedWeight,
    status: row.status,
    totalEnteredCount: row.totalEnteredCount,
    missingCount: row.missingCount,
    absentCount: row.absentCount,
    cells: row.cells.map((cell) => presentGradebookCell(cell)),
  };
}

function presentGradebookStudent(
  student: GradebookRowModel['enrollment']['student'],
): GradebookStudentResponseDto {
  const nameEn = [student.firstName, student.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');

  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    nameAr: null,
    nameEn,
    code: null,
    admissionNo: null,
  };
}

export function presentGradebookCell(
  cell: GradebookCellModel,
): GradebookCellResponseDto {
  return {
    assessmentId: cell.assessment.id,
    itemId: cell.item?.id ?? null,
    score: cell.score,
    status: presentGradeItemStatus(cell.status),
    percent: cell.percent,
    weightedContribution: cell.weightedContribution,
    comment: cell.comment,
    isVirtualMissing: cell.isVirtualMissing,
  };
}

function presentGradebookSummary(
  summary: GradesGradebookModel['summary'],
): GradebookSummaryResponseDto {
  return {
    studentCount: summary.studentCount,
    assessmentCount: summary.assessmentCount,
    averagePercent: summary.averagePercent,
    passingCount: summary.passingCount,
    failingCount: summary.failingCount,
    incompleteCount: summary.incompleteCount,
  };
}

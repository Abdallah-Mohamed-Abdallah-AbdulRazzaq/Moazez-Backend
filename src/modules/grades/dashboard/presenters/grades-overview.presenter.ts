import {
  GradeAssessmentApprovalStatus,
  GradeItemStatus,
} from '@prisma/client';
import { applyRounding } from '../../shared/domain/grade-calculation';
import {
  GradebookCellModel,
  GradesGradebookModel,
} from '../../shared/application/grades-read-model.builder';
import {
  presentAssessmentApprovalStatus,
  presentDecimal,
  presentDeliveryMode,
  presentGradeScopeType,
} from '../../shared/presenters/grades.presenter';

type GradesDashboardScopeType =
  | 'school'
  | 'stage'
  | 'grade'
  | 'section'
  | 'classroom';

export function presentGradesOverview(params: {
  gradebook: GradesGradebookModel;
  scopeLabel: string;
}) {
  const { gradebook } = params;
  const enteredCount = gradebook.rows.reduce(
    (sum, row) => sum + row.totalEnteredCount,
    0,
  );
  const missingCount = gradebook.rows.reduce(
    (sum, row) => sum + row.missingCount,
    0,
  );
  const absentCount = gradebook.rows.reduce(
    (sum, row) => sum + row.absentCount,
    0,
  );
  const completedWeights = gradebook.rows.map((row) => row.completedWeight);
  const assessments = gradebook.columns.map((column) =>
    presentOverviewAssessment(gradebook, column.assessment.id),
  );

  return {
    academicYearId: gradebook.academicYearId,
    yearId: gradebook.yearId,
    termId: gradebook.termId,
    subjectId: gradebook.subjectId,
    scope: {
      scopeType: presentGradeScopeType(
        gradebook.scope.scopeType,
      ) as GradesDashboardScopeType,
      scopeId: gradebook.scope.scopeKey,
      label: params.scopeLabel,
    },
    totals: {
      studentCount: gradebook.summary.studentCount,
      assessmentCount: gradebook.summary.assessmentCount,
      completedAssessmentCount: countCompletedAssessments(gradebook),
      publishedAssessmentCount: gradebook.columns.filter(
        (column) =>
          column.assessment.approvalStatus ===
          GradeAssessmentApprovalStatus.PUBLISHED,
      ).length,
      approvedAssessmentCount: gradebook.columns.filter(
        (column) =>
          column.assessment.approvalStatus ===
          GradeAssessmentApprovalStatus.APPROVED,
      ).length,
      lockedAssessmentCount: gradebook.columns.filter((column) =>
        Boolean(column.assessment.lockedAt),
      ).length,
    },
    performance: {
      averagePercent: gradebook.summary.averagePercent,
      highestPercent: gradebook.summary.highestPercent,
      lowestPercent: gradebook.summary.lowestPercent,
      passingCount: gradebook.summary.passingCount,
      failingCount: gradebook.summary.failingCount,
      incompleteCount: gradebook.summary.incompleteCount,
    },
    completion: {
      enteredCount,
      missingCount,
      absentCount,
      completedWeightAverage:
        completedWeights.length > 0
          ? applyRounding(
              completedWeights.reduce((sum, value) => sum + value, 0) /
                completedWeights.length,
              gradebook.rule.rounding,
            )
          : null,
    },
    assessments,
    rule: {
      source: gradebook.rule.source,
      passMark: gradebook.rule.passMark,
      rounding: String(gradebook.rule.rounding).toLowerCase(),
    },
    emptyState: buildEmptyState(gradebook),
  };
}

function presentOverviewAssessment(
  gradebook: GradesGradebookModel,
  assessmentId: string,
) {
  const column = gradebook.columns.find(
    (candidate) => candidate.assessment.id === assessmentId,
  );
  const assessment = column?.assessment;
  if (!assessment) {
    throw new Error(`Overview assessment ${assessmentId} was not found`);
  }

  const cells = getCellsForAssessment(gradebook, assessmentId);
  const enteredCells = cells.filter(
    (cell) => cell.status === GradeItemStatus.ENTERED && cell.percent !== null,
  );

  return {
    assessmentId: assessment.id,
    title: assessment.titleEn ?? assessment.titleAr ?? null,
    subjectId: assessment.subjectId,
    subjectName: assessment.subject.nameEn || assessment.subject.nameAr || null,
    type: assessment.type,
    deliveryMode: presentDeliveryMode(assessment.deliveryMode),
    approvalStatus: presentAssessmentApprovalStatus(assessment.approvalStatus),
    date: assessment.date.toISOString().slice(0, 10),
    weight: presentDecimal(assessment.weight) ?? 0,
    maxScore: presentDecimal(assessment.maxScore) ?? 0,
    averagePercent:
      enteredCells.length > 0
        ? applyRounding(
            enteredCells.reduce((sum, cell) => sum + (cell.percent ?? 0), 0) /
              enteredCells.length,
            gradebook.rule.rounding,
          )
        : null,
    enteredCount: cells.filter((cell) => cell.status === GradeItemStatus.ENTERED)
      .length,
    missingCount: cells.filter((cell) => cell.status === GradeItemStatus.MISSING)
      .length,
    absentCount: cells.filter((cell) => cell.status === GradeItemStatus.ABSENT)
      .length,
  };
}

function countCompletedAssessments(gradebook: GradesGradebookModel): number {
  if (gradebook.summary.studentCount === 0) return 0;

  return gradebook.columns.filter((column) => {
    const cells = getCellsForAssessment(gradebook, column.assessment.id);
    return (
      cells.length === gradebook.summary.studentCount &&
      cells.every((cell) => cell.status !== GradeItemStatus.MISSING)
    );
  }).length;
}

function getCellsForAssessment(
  gradebook: GradesGradebookModel,
  assessmentId: string,
): GradebookCellModel[] {
  return gradebook.rows.flatMap((row) =>
    row.cells.filter((cell) => cell.assessment.id === assessmentId),
  );
}

function buildEmptyState(gradebook: GradesGradebookModel) {
  if (gradebook.summary.studentCount === 0) {
    return {
      reason: 'no_students',
      message: 'No active students were found for the selected grades scope.',
    };
  }

  if (gradebook.summary.assessmentCount === 0) {
    return {
      reason: 'no_assessments',
      message: 'No published or approved assessments were found for this selection.',
    };
  }

  return null;
}

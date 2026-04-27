import {
  presentDecimal,
  presentGradeItemStatus,
} from '../../shared/presenters/grades.presenter';
import {
  StudentGradeSnapshotAssessmentResponseDto,
  StudentGradeSnapshotResponseDto,
  StudentGradeSnapshotRuleResponseDto,
  StudentGradeSnapshotSubjectResponseDto,
} from '../dto/get-student-grade-snapshot-query.dto';
import {
  EffectiveGradesReadRule,
  GradebookCellModel,
  StudentGradeSnapshotModel,
  StudentGradeSnapshotSubjectModel,
} from '../../shared/application/grades-read-model.builder';

export function presentStudentGradeSnapshot(
  snapshot: StudentGradeSnapshotModel,
): StudentGradeSnapshotResponseDto {
  return {
    studentId: snapshot.student.id,
    enrollmentId: snapshot.enrollment.id,
    academicYearId: snapshot.academicYearId,
    yearId: snapshot.yearId,
    termId: snapshot.termId,
    subjectId: snapshot.subjectId,
    rule: presentSnapshotRule(snapshot.rule),
    finalPercent: snapshot.finalPercent,
    completedWeight: snapshot.completedWeight,
    status: snapshot.status,
    subjects: snapshot.subjects.map((subject) =>
      presentSnapshotSubject(subject),
    ),
    assessments: snapshot.assessments.map((cell) =>
      presentSnapshotAssessment(cell),
    ),
  };
}

function presentSnapshotRule(
  rule: EffectiveGradesReadRule,
): StudentGradeSnapshotRuleResponseDto {
  return {
    source: rule.source,
    ruleId: rule.ruleId,
    passMark: rule.passMark,
    rounding: String(rule.rounding).toLowerCase(),
    gradingScale: String(rule.gradingScale).toLowerCase(),
  };
}

function presentSnapshotSubject(
  subject: StudentGradeSnapshotSubjectModel,
): StudentGradeSnapshotSubjectResponseDto {
  return {
    subjectId: subject.subjectId,
    subjectName: subject.subjectName,
    subjectNameAr: subject.subjectNameAr,
    subjectNameEn: subject.subjectNameEn,
    finalPercent: subject.finalPercent,
    completedWeight: subject.completedWeight,
    assessmentCount: subject.assessmentCount,
    enteredCount: subject.enteredCount,
    missingCount: subject.missingCount,
    absentCount: subject.absentCount,
    status: subject.status,
  };
}

function presentSnapshotAssessment(
  cell: GradebookCellModel,
): StudentGradeSnapshotAssessmentResponseDto {
  const assessment = cell.assessment;
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
    itemId: cell.item?.id ?? null,
    score: cell.score,
    percent: cell.percent,
    weightedContribution: cell.weightedContribution,
    status: presentGradeItemStatus(cell.status),
    comment: cell.comment,
    isVirtualMissing: cell.isVirtualMissing,
  };
}

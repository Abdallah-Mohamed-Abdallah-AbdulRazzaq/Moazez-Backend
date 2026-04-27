import {
  GradeAssessmentApprovalStatus,
  GradeItemStatus,
  GradeRoundingMode,
  GradeRuleScale,
  GradeScopeType,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  GradeAssessmentInvalidScopeException,
  normalizeGradeScopeType,
} from '../domain/grade-scope';
import {
  calculateGradeCell,
  calculateStudentFinalPercent,
  deriveGradebookStudentStatus,
  GradebookStudentStatus,
  applyRounding,
  toGradeNumber,
} from '../domain/grade-calculation';
import {
  GradesReadAssessmentRecord,
  GradesReadEnrollmentRecord,
  GradesReadGradeItemRecord,
  GradesReadModelRepository,
  GradesReadRuleRecord,
  GradesReadScope,
  GradesReadStudentRecord,
} from '../infrastructure/grades-read-model.repository';

export type EffectiveGradesReadRuleSource =
  | 'DEFAULT'
  | 'SCHOOL'
  | 'GRADE'
  | 'STAGE';

export interface GradesReadQueryInput {
  academicYearId?: string;
  yearId?: string;
  termId?: string;
  subjectId?: string;
  scopeType?: string | GradeScopeType;
  scopeId?: string;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
  search?: string;
  assessmentStatus?: GradeAssessmentApprovalStatus;
}

export interface EffectiveGradesReadRule {
  source: EffectiveGradesReadRuleSource;
  ruleId: string | null;
  scopeType: GradeScopeType;
  scopeKey: string;
  gradeId: string | null;
  gradingScale: GradeRuleScale;
  passMark: number;
  rounding: GradeRoundingMode;
}

export interface GradebookColumnModel {
  assessment: GradesReadAssessmentRecord;
}

export interface GradebookCellModel {
  assessment: GradesReadAssessmentRecord;
  item: GradesReadGradeItemRecord | null;
  score: number | null;
  status: GradeItemStatus;
  percent: number | null;
  weightedContribution: number | null;
  comment: string | null;
  isVirtualMissing: boolean;
}

export interface GradebookRowModel {
  enrollment: GradesReadEnrollmentRecord;
  finalPercent: number | null;
  completedWeight: number;
  status: GradebookStudentStatus;
  totalEnteredCount: number;
  missingCount: number;
  absentCount: number;
  cells: GradebookCellModel[];
}

export interface GradebookSummaryModel {
  studentCount: number;
  assessmentCount: number;
  averagePercent: number | null;
  highestPercent: number | null;
  lowestPercent: number | null;
  passingCount: number;
  failingCount: number;
  incompleteCount: number;
}

export interface GradesGradebookModel {
  academicYearId: string;
  yearId: string;
  termId: string;
  subjectId: string | null;
  scope: GradesReadScope;
  rule: EffectiveGradesReadRule;
  columns: GradebookColumnModel[];
  rows: GradebookRowModel[];
  summary: GradebookSummaryModel;
}

export interface StudentGradeSnapshotSubjectModel {
  subjectId: string;
  subjectName: string;
  subjectNameAr: string | null;
  subjectNameEn: string | null;
  finalPercent: number | null;
  completedWeight: number;
  assessmentCount: number;
  enteredCount: number;
  missingCount: number;
  absentCount: number;
  status: GradebookStudentStatus;
}

export interface StudentGradeSnapshotModel {
  student: GradesReadStudentRecord;
  enrollment: GradesReadEnrollmentRecord;
  academicYearId: string;
  yearId: string;
  termId: string;
  subjectId: string | null;
  rule: EffectiveGradesReadRule;
  finalPercent: number | null;
  completedWeight: number;
  status: GradebookStudentStatus;
  subjects: StudentGradeSnapshotSubjectModel[];
  assessments: GradebookCellModel[];
}

const DEFAULT_READ_RULE: EffectiveGradesReadRule = {
  source: 'DEFAULT',
  ruleId: null,
  scopeType: GradeScopeType.SCHOOL,
  scopeKey: 'school',
  gradeId: null,
  gradingScale: GradeRuleScale.PERCENTAGE,
  passMark: 50,
  rounding: GradeRoundingMode.DECIMAL_2,
};

export async function buildGradesGradebookModel(params: {
  repository: GradesReadModelRepository;
  schoolId: string;
  query: GradesReadQueryInput;
  includeVirtualMissing: boolean;
}): Promise<GradesGradebookModel> {
  const academicYearId = resolveReadAcademicYearId(params.query);
  const termId = requireTermId(params.query.termId);

  await validateGradesReadContext({
    repository: params.repository,
    academicYearId,
    termId,
    subjectId: params.query.subjectId,
  });

  const scope = await resolveGradesReadScope({
    repository: params.repository,
    schoolId: params.schoolId,
    input: params.query,
  });

  const rule = await resolveEffectiveGradesReadRule({
    repository: params.repository,
    academicYearId,
    termId,
    schoolId: params.schoolId,
    scope,
  });

  const [enrollments, assessments] = await Promise.all([
    params.repository.listEnrollmentsForScope({
      academicYearId,
      termId,
      scope,
      search: params.query.search,
    }),
    params.repository.listAssessmentsForScope({
      academicYearId,
      termId,
      subjectId: params.query.subjectId,
      scope,
      approvalStatuses: normalizeAssessmentStatuses(
        params.query.assessmentStatus,
      ),
    }),
  ]);
  const gradeItems = await params.repository.listGradeItems({
    assessmentIds: assessments.map((assessment) => assessment.id),
    studentIds: enrollments.map((enrollment) => enrollment.studentId),
  });

  const rows = buildGradebookRows({
    enrollments,
    assessments,
    gradeItems,
    rule,
    includeVirtualMissing: params.includeVirtualMissing,
  });

  return {
    academicYearId,
    yearId: academicYearId,
    termId,
    subjectId: params.query.subjectId ?? null,
    scope,
    rule,
    columns: assessments.map((assessment) => ({ assessment })),
    rows,
    summary: summarizeGradebookRows(rows, assessments.length, rule),
  };
}

export async function buildStudentGradeSnapshotModel(params: {
  repository: GradesReadModelRepository;
  schoolId: string;
  studentId: string;
  query: Pick<
    GradesReadQueryInput,
    'academicYearId' | 'yearId' | 'termId' | 'subjectId'
  >;
}): Promise<StudentGradeSnapshotModel> {
  const academicYearId = resolveReadAcademicYearId(params.query);
  const termId = requireTermId(params.query.termId);

  await validateGradesReadContext({
    repository: params.repository,
    academicYearId,
    termId,
    subjectId: params.query.subjectId,
  });

  const student = await params.repository.findStudentById(params.studentId);
  if (!student) {
    throw new NotFoundDomainException('Student not found', {
      studentId: params.studentId,
    });
  }

  const enrollment = await params.repository.findActiveEnrollmentForStudent({
    studentId: params.studentId,
    academicYearId,
    termId,
  });
  if (!enrollment) {
    throw new NotFoundDomainException('Student enrollment not found', {
      studentId: params.studentId,
      academicYearId,
      termId,
    });
  }

  const scope = buildScopeFromEnrollment(enrollment);
  const rule = await resolveEffectiveGradesReadRule({
    repository: params.repository,
    academicYearId,
    termId,
    schoolId: params.schoolId,
    scope,
  });
  const assessments = await params.repository.listAssessmentsForScope({
    academicYearId,
    termId,
    subjectId: params.query.subjectId,
    scope,
  });
  const gradeItems = await params.repository.listGradeItems({
    assessmentIds: assessments.map((assessment) => assessment.id),
    studentIds: [params.studentId],
  });
  const [row] = buildGradebookRows({
    enrollments: [enrollment],
    assessments,
    gradeItems,
    rule,
    includeVirtualMissing: true,
  });

  return {
    student,
    enrollment,
    academicYearId,
    yearId: academicYearId,
    termId,
    subjectId: params.query.subjectId ?? null,
    rule,
    finalPercent: row?.finalPercent ?? null,
    completedWeight: row?.completedWeight ?? 0,
    status: row?.status ?? 'incomplete',
    subjects: buildSnapshotSubjects(row?.cells ?? [], rule),
    assessments: row?.cells ?? [],
  };
}

export async function resolveGradesReadScope(params: {
  repository: GradesReadModelRepository;
  schoolId: string;
  input: Pick<
    GradesReadQueryInput,
    | 'scopeType'
    | 'scopeId'
    | 'stageId'
    | 'gradeId'
    | 'sectionId'
    | 'classroomId'
  >;
}): Promise<GradesReadScope> {
  const scopeType = resolveInputScopeType(params.input);

  switch (scopeType) {
    case GradeScopeType.SCHOOL:
      if (params.input.scopeId && params.input.scopeId !== params.schoolId) {
        throw new NotFoundDomainException('School not found', {
          schoolId: params.input.scopeId,
        });
      }

      return {
        scopeType,
        scopeKey: params.schoolId,
        stageId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
      };

    case GradeScopeType.STAGE: {
      const stageId = requireMatchingScopeId('stageId', params.input);
      const stage = await params.repository.findStage(stageId);
      if (!stage) {
        throw new NotFoundDomainException('Stage not found', { stageId });
      }

      return {
        scopeType,
        scopeKey: stage.id,
        stageId: stage.id,
        gradeId: null,
        sectionId: null,
        classroomId: null,
      };
    }

    case GradeScopeType.GRADE: {
      const gradeId = requireMatchingScopeId('gradeId', params.input);
      const grade = await params.repository.findGrade(gradeId);
      if (!grade) {
        throw new NotFoundDomainException('Grade not found', { gradeId });
      }

      assertOptionalParent('stageId', params.input.stageId, grade.stageId);
      return {
        scopeType,
        scopeKey: grade.id,
        stageId: grade.stageId,
        gradeId: grade.id,
        sectionId: null,
        classroomId: null,
      };
    }

    case GradeScopeType.SECTION: {
      const sectionId = requireMatchingScopeId('sectionId', params.input);
      const section = await params.repository.findSectionWithGrade(sectionId);
      if (!section) {
        throw new NotFoundDomainException('Section not found', { sectionId });
      }

      assertOptionalParent('gradeId', params.input.gradeId, section.gradeId);
      assertOptionalParent('stageId', params.input.stageId, section.grade.stageId);
      return {
        scopeType,
        scopeKey: section.id,
        stageId: section.grade.stageId,
        gradeId: section.gradeId,
        sectionId: section.id,
        classroomId: null,
      };
    }

    case GradeScopeType.CLASSROOM: {
      const classroomId = requireMatchingScopeId('classroomId', params.input);
      const classroom =
        await params.repository.findClassroomWithGrade(classroomId);
      if (!classroom) {
        throw new NotFoundDomainException('Classroom not found', {
          classroomId,
        });
      }

      assertOptionalParent(
        'sectionId',
        params.input.sectionId,
        classroom.sectionId,
      );
      assertOptionalParent(
        'gradeId',
        params.input.gradeId,
        classroom.section.gradeId,
      );
      assertOptionalParent(
        'stageId',
        params.input.stageId,
        classroom.section.grade.stageId,
      );

      return {
        scopeType,
        scopeKey: classroom.id,
        stageId: classroom.section.grade.stageId,
        gradeId: classroom.section.gradeId,
        sectionId: classroom.sectionId,
        classroomId: classroom.id,
      };
    }
  }
}

export async function resolveEffectiveGradesReadRule(params: {
  repository: GradesReadModelRepository;
  academicYearId: string;
  termId: string;
  schoolId: string;
  scope: GradesReadScope;
}): Promise<EffectiveGradesReadRule> {
  const stageRule =
    params.scope.scopeType === GradeScopeType.STAGE
      ? await params.repository.findRuleByUniqueScope({
          academicYearId: params.academicYearId,
          termId: params.termId,
          scopeType: GradeScopeType.STAGE,
          scopeKey: params.scope.scopeKey,
        })
      : null;

  if (stageRule) return presentRule('STAGE', stageRule);

  if (params.scope.gradeId) {
    const gradeRule = await params.repository.findGradeRule({
      academicYearId: params.academicYearId,
      termId: params.termId,
      gradeId: params.scope.gradeId,
    });

    if (gradeRule) return presentRule('GRADE', gradeRule);
  }

  const schoolRule = await params.repository.findSchoolRule({
    academicYearId: params.academicYearId,
    termId: params.termId,
    schoolId: params.schoolId,
  });
  if (schoolRule) return presentRule('SCHOOL', schoolRule);

  return {
    ...DEFAULT_READ_RULE,
    scopeType: params.scope.scopeType,
    scopeKey: params.scope.scopeKey,
    gradeId: params.scope.gradeId,
  };
}

function buildGradebookRows(params: {
  enrollments: GradesReadEnrollmentRecord[];
  assessments: GradesReadAssessmentRecord[];
  gradeItems: GradesReadGradeItemRecord[];
  rule: EffectiveGradesReadRule;
  includeVirtualMissing: boolean;
}): GradebookRowModel[] {
  const itemMap = new Map<string, GradesReadGradeItemRecord>();
  for (const item of params.gradeItems) {
    itemMap.set(buildItemKey(item.assessmentId, item.studentId), item);
  }

  return params.enrollments.map((enrollment) => {
    const cells = params.assessments
      .map((assessment) => {
        const item =
          itemMap.get(buildItemKey(assessment.id, enrollment.studentId)) ??
          null;

        if (!item && !params.includeVirtualMissing) return null;

        return buildGradebookCell({
          assessment,
          item,
          rule: params.rule,
        });
      })
      .filter((cell): cell is GradebookCellModel => Boolean(cell));

    const final = calculateStudentFinalPercent(
      cells.map((cell) => ({
        status: cell.status,
        score: cell.score,
        maxScore: cell.assessment.maxScore,
        weight: cell.assessment.weight,
      })),
      params.rule,
    );
    const status = deriveGradebookStudentStatus(
      final.finalPercent,
      final.hasEnteredScores,
      params.rule,
    );

    return {
      enrollment,
      finalPercent: final.finalPercent,
      completedWeight: final.completedWeight,
      status,
      totalEnteredCount: final.totalEnteredCount,
      missingCount: final.missingCount,
      absentCount: final.absentCount,
      cells,
    };
  });
}

function buildGradebookCell(params: {
  assessment: GradesReadAssessmentRecord;
  item: GradesReadGradeItemRecord | null;
  rule: EffectiveGradesReadRule;
}): GradebookCellModel {
  const status = params.item?.status ?? GradeItemStatus.MISSING;
  const score = toGradeNumber(params.item?.score) ?? null;
  const calculated = calculateGradeCell(
    {
      status,
      score,
      maxScore: params.assessment.maxScore,
      weight: params.assessment.weight,
    },
    params.rule,
  );

  return {
    assessment: params.assessment,
    item: params.item,
    score,
    status,
    percent: calculated.percent,
    weightedContribution: calculated.weightedContribution,
    comment: params.item?.comment ?? null,
    isVirtualMissing: !params.item,
  };
}

function summarizeGradebookRows(
  rows: GradebookRowModel[],
  assessmentCount: number,
  rule: EffectiveGradesReadRule,
): GradebookSummaryModel {
  const calculableRows = rows.filter((row) => row.totalEnteredCount > 0);
  const percents = calculableRows
    .map((row) => row.finalPercent)
    .filter((value): value is number => value !== null);

  return {
    studentCount: rows.length,
    assessmentCount,
    averagePercent: applyRounding(average(percents), rule.rounding),
    highestPercent: percents.length > 0 ? Math.max(...percents) : null,
    lowestPercent: percents.length > 0 ? Math.min(...percents) : null,
    passingCount: rows.filter((row) => row.status === 'passing').length,
    failingCount: rows.filter((row) => row.status === 'failing').length,
    incompleteCount: rows.filter((row) => row.status === 'incomplete').length,
  };
}

function buildSnapshotSubjects(
  cells: GradebookCellModel[],
  rule: EffectiveGradesReadRule,
): StudentGradeSnapshotSubjectModel[] {
  const cellsBySubject = new Map<string, GradebookCellModel[]>();

  for (const cell of cells) {
    const subjectCells = cellsBySubject.get(cell.assessment.subjectId) ?? [];
    subjectCells.push(cell);
    cellsBySubject.set(cell.assessment.subjectId, subjectCells);
  }

  return [...cellsBySubject.entries()].map(([subjectId, subjectCells]) => {
    const final = calculateStudentFinalPercent(
      subjectCells.map((cell) => ({
        status: cell.status,
        score: cell.score,
        maxScore: cell.assessment.maxScore,
        weight: cell.assessment.weight,
      })),
      rule,
    );
    const status = deriveGradebookStudentStatus(
      final.finalPercent,
      final.hasEnteredScores,
      rule,
    );
    const subject = subjectCells[0].assessment.subject;

    return {
      subjectId,
      subjectName: subject.nameEn || subject.nameAr,
      subjectNameAr: subject.nameAr,
      subjectNameEn: subject.nameEn,
      finalPercent: final.finalPercent,
      completedWeight: final.completedWeight,
      assessmentCount: subjectCells.length,
      enteredCount: final.totalEnteredCount,
      missingCount: final.missingCount,
      absentCount: final.absentCount,
      status,
    };
  });
}

function buildScopeFromEnrollment(
  enrollment: GradesReadEnrollmentRecord,
): GradesReadScope {
  const section = enrollment.classroom.section;
  const grade = section.grade;

  return {
    scopeType: GradeScopeType.CLASSROOM,
    scopeKey: enrollment.classroomId,
    stageId: grade.stageId,
    gradeId: grade.id,
    sectionId: section.id,
    classroomId: enrollment.classroomId,
  };
}

async function validateGradesReadContext(params: {
  repository: GradesReadModelRepository;
  academicYearId: string;
  termId: string;
  subjectId?: string;
}): Promise<void> {
  const [academicYear, term, subject] = await Promise.all([
    params.repository.findAcademicYear(params.academicYearId),
    params.repository.findTerm(params.termId),
    params.subjectId
      ? params.repository.findSubject(params.subjectId)
      : Promise.resolve(null),
  ]);

  if (!academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId: params.academicYearId,
    });
  }

  if (!term || term.academicYearId !== params.academicYearId) {
    throw new NotFoundDomainException('Term not found', {
      academicYearId: params.academicYearId,
      termId: params.termId,
    });
  }

  if (params.subjectId && !subject) {
    throw new NotFoundDomainException('Subject not found', {
      subjectId: params.subjectId,
    });
  }
}

function presentRule(
  source: EffectiveGradesReadRuleSource,
  rule: GradesReadRuleRecord,
): EffectiveGradesReadRule {
  return {
    source,
    ruleId: rule.id,
    scopeType: rule.scopeType,
    scopeKey: rule.scopeKey,
    gradeId: rule.gradeId,
    gradingScale: rule.gradingScale,
    passMark: toGradeNumber(rule.passMark) ?? 50,
    rounding: rule.rounding,
  };
}

function resolveReadAcademicYearId(input: {
  academicYearId?: string;
  yearId?: string;
}): string {
  const academicYearId = input.academicYearId ?? input.yearId;
  if (!academicYearId) {
    throw new ValidationDomainException('Academic year is required', {
      field: 'academicYearId',
      aliases: ['yearId'],
    });
  }

  return academicYearId;
}

function requireTermId(termId: string | undefined): string {
  if (!termId) {
    throw new ValidationDomainException('Term is required', {
      field: 'termId',
    });
  }

  return termId;
}

function resolveInputScopeType(input: {
  scopeType?: string | GradeScopeType;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
}): GradeScopeType {
  if (input.scopeType) return normalizeGradeScopeType(input.scopeType);
  if (input.classroomId) return GradeScopeType.CLASSROOM;
  if (input.sectionId) return GradeScopeType.SECTION;
  if (input.gradeId) return GradeScopeType.GRADE;
  if (input.stageId) return GradeScopeType.STAGE;
  return GradeScopeType.SCHOOL;
}

function normalizeAssessmentStatuses(
  status?: GradeAssessmentApprovalStatus,
): GradeAssessmentApprovalStatus[] {
  if (!status) {
    return [
      GradeAssessmentApprovalStatus.PUBLISHED,
      GradeAssessmentApprovalStatus.APPROVED,
    ];
  }

  return status === GradeAssessmentApprovalStatus.PUBLISHED ||
    status === GradeAssessmentApprovalStatus.APPROVED
    ? [status]
    : [];
}

function requireMatchingScopeId(
  field: keyof Pick<
    GradesReadQueryInput,
    'stageId' | 'gradeId' | 'sectionId' | 'classroomId'
  >,
  input: Pick<
    GradesReadQueryInput,
    'scopeId' | 'stageId' | 'gradeId' | 'sectionId' | 'classroomId'
  >,
): string {
  const specificId = input[field];
  const scopeId = input.scopeId;

  if (specificId && scopeId && specificId !== scopeId) {
    throw new ValidationDomainException('Scope id aliases do not match', {
      field,
      scopeId,
      [field]: specificId,
    });
  }

  const value = specificId ?? scopeId;
  if (!value) {
    throw new GradeAssessmentInvalidScopeException({ field });
  }

  return value;
}

function assertOptionalParent(
  field: keyof Pick<
    GradesReadQueryInput,
    'stageId' | 'gradeId' | 'sectionId'
  >,
  provided: string | null | undefined,
  actual: string,
): void {
  if (provided && provided !== actual) {
    throw new ValidationDomainException(
      'Grade read-model parent ids do not match the selected scope',
      { field },
    );
  }
}

function buildItemKey(assessmentId: string, studentId: string): string {
  return `${assessmentId}:${studentId}`;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;

  return (
    values.reduce((sum, value) => sum + value, 0) /
    Math.max(values.length, 1)
  );
}

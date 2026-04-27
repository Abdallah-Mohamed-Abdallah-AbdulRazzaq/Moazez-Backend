import {
  AuditOutcome,
  GradeAssessmentApprovalStatus,
  GradeScopeType,
  Prisma,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { GradesScope } from '../../grades-context';
import {
  GradeAssessmentInvalidScopeException,
  normalizeGradeScopeType,
} from '../../shared/domain/grade-scope';
import {
  CreateGradeAssessmentDto,
  ListGradeAssessmentsQueryDto,
  UpdateGradeAssessmentDto,
} from '../dto/grade-assessment.dto';
import {
  AssessmentScopePayload,
  areScopesEqual,
  assertDateInsideTerm,
  assertNoGradeItemsForProtectedAssessmentChange,
  assertTermWritableForAssessment,
  assertWeightBudget,
  buildAssessmentScopePayload,
  formatDateOnly,
  hasOwn,
  normalizeAssessmentType,
  normalizeNullableText,
  normalizeOptionalTextForPatch,
  normalizeScoreOnlyDeliveryMode,
  validateAssessmentMaxScore,
  validateAssessmentWeight,
} from '../domain/grade-assessment-domain';
import {
  CreateGradeAssessmentData,
  GradeAssessmentRecord,
  GradesAssessmentsRepository,
  ListGradeAssessmentsFilters,
  TermReferenceRecord,
  UpdateGradeAssessmentData,
} from '../infrastructure/grades-assessments.repository';

type ScopeCommand = {
  scopeType?: string | GradeScopeType | null;
  scopeId?: string | null;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
};

export function resolveAssessmentAcademicYearId(input: {
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

export async function validateAssessmentAcademicContext(
  repository: GradesAssessmentsRepository,
  academicYearId: string,
  termId: string,
): Promise<{ term: TermReferenceRecord }> {
  const [academicYear, term] = await Promise.all([
    repository.findAcademicYear(academicYearId),
    repository.findTerm(termId),
  ]);

  if (!academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId,
    });
  }

  if (!term || term.academicYearId !== academicYearId) {
    throw new NotFoundDomainException('Term not found', {
      academicYearId,
      termId,
    });
  }

  return { term };
}

export async function validateAssessmentSubject(
  repository: GradesAssessmentsRepository,
  subjectId: string,
): Promise<void> {
  const subject = await repository.findSubject(subjectId);
  if (!subject) {
    throw new NotFoundDomainException('Subject not found', { subjectId });
  }
}

export async function resolveAssessmentScopeForWrite(
  repository: GradesAssessmentsRepository,
  input: ScopeCommand & { schoolId: string },
): Promise<AssessmentScopePayload> {
  const scopeType = normalizeGradeScopeType(input.scopeType);

  switch (scopeType) {
    case GradeScopeType.SCHOOL:
      if (input.scopeId && input.scopeId !== input.schoolId) {
        throw new NotFoundDomainException('School not found', {
          schoolId: input.scopeId,
        });
      }

      return buildAssessmentScopePayload({
        schoolId: input.schoolId,
        scopeType,
      });

    case GradeScopeType.STAGE: {
      const stageId = requireMatchingScopeId('stageId', input);
      const stage = await repository.findStage(stageId);
      if (!stage) {
        throw new NotFoundDomainException('Stage not found', { stageId });
      }

      return buildAssessmentScopePayload({
        schoolId: input.schoolId,
        scopeType,
        stageId,
      });
    }

    case GradeScopeType.GRADE: {
      const gradeId = requireMatchingScopeId('gradeId', input);
      const grade = await repository.findGrade(gradeId);
      if (!grade) {
        throw new NotFoundDomainException('Grade not found', { gradeId });
      }

      assertOptionalParent('stageId', input.stageId, grade.stageId);
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
      const sectionId = requireMatchingScopeId('sectionId', input);
      const section = await repository.findSectionWithGrade(sectionId);
      if (!section) {
        throw new NotFoundDomainException('Section not found', { sectionId });
      }

      assertOptionalParent('gradeId', input.gradeId, section.gradeId);
      assertOptionalParent('stageId', input.stageId, section.grade.stageId);
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
      const classroomId = requireMatchingScopeId('classroomId', input);
      const classroom =
        await repository.findClassroomWithGrade(classroomId);
      if (!classroom) {
        throw new NotFoundDomainException('Classroom not found', {
          classroomId,
        });
      }

      assertOptionalParent('sectionId', input.sectionId, classroom.sectionId);
      assertOptionalParent('gradeId', input.gradeId, classroom.section.gradeId);
      assertOptionalParent(
        'stageId',
        input.stageId,
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

export function normalizeAssessmentListFilters(
  query: ListGradeAssessmentsQueryDto,
  schoolId: string,
): ListGradeAssessmentsFilters {
  const parsedDates = parseAssessmentListDateFilters(query);
  const scopeType = query.scopeType
    ? normalizeGradeScopeType(query.scopeType)
    : undefined;

  return {
    ...(query.academicYearId ?? query.yearId
      ? { academicYearId: query.academicYearId ?? query.yearId }
      : {}),
    ...(query.termId ? { termId: query.termId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(scopeType ? { scopeType } : {}),
    ...(scopeType
      ? { scopeKey: resolveOptionalListScopeKey(scopeType, query, schoolId) }
      : {}),
    ...(query.stageId ? { stageId: query.stageId } : {}),
    ...(query.gradeId ? { gradeId: query.gradeId } : {}),
    ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    ...(query.classroomId ? { classroomId: query.classroomId } : {}),
    ...(query.approvalStatus ? { approvalStatus: query.approvalStatus } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.search ? { search: query.search } : {}),
    ...parsedDates,
  };
}

export function buildCreateAssessmentData(params: {
  scope: GradesScope;
  academicYearId: string;
  command: CreateGradeAssessmentDto;
  assessmentScope: AssessmentScopePayload;
}): {
  data: CreateGradeAssessmentData;
  normalized: {
    date: Date;
    weight: number;
    maxScore: number;
  };
} {
  const weight = validateAssessmentWeight(params.command.weight);
  const maxScore = validateAssessmentMaxScore(params.command.maxScore);
  const date = parseAssessmentDate(params.command.date, 'date');
  const titleEn = normalizeNullableText(
    params.command.titleEn ?? params.command.title,
  );
  const titleAr = normalizeNullableText(params.command.titleAr);

  return {
    normalized: { date, weight, maxScore },
    data: {
      schoolId: params.scope.schoolId,
      academicYearId: params.academicYearId,
      termId: params.command.termId,
      subjectId: params.command.subjectId,
      scopeType: params.assessmentScope.scopeType,
      scopeKey: params.assessmentScope.scopeKey,
      stageId: params.assessmentScope.stageId,
      gradeId: params.assessmentScope.gradeId,
      sectionId: params.assessmentScope.sectionId,
      classroomId: params.assessmentScope.classroomId,
      titleEn,
      titleAr,
      type: normalizeAssessmentType(params.command.type),
      deliveryMode: normalizeScoreOnlyDeliveryMode(params.command.deliveryMode),
      date,
      weight: new Prisma.Decimal(weight),
      maxScore: new Prisma.Decimal(maxScore),
      expectedTimeMinutes: params.command.expectedTimeMinutes ?? null,
      approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
      createdById: params.scope.actorId,
    },
  };
}

export function buildUpdateAssessmentData(params: {
  command: UpdateGradeAssessmentDto;
  assessmentScope?: AssessmentScopePayload;
}): UpdateGradeAssessmentData {
  const data: UpdateGradeAssessmentData = {};

  if (hasOwn(params.command, 'subjectId')) {
    data.subjectId = params.command.subjectId;
  }

  if (params.assessmentScope) {
    data.scopeType = params.assessmentScope.scopeType;
    data.scopeKey = params.assessmentScope.scopeKey;
    data.stageId = params.assessmentScope.stageId;
    data.gradeId = params.assessmentScope.gradeId;
    data.sectionId = params.assessmentScope.sectionId;
    data.classroomId = params.assessmentScope.classroomId;
  }

  if (hasOwn(params.command, 'titleEn') || hasOwn(params.command, 'title')) {
    data.titleEn = normalizeOptionalTextForPatch(
      params.command.titleEn ?? params.command.title,
    );
  }

  if (hasOwn(params.command, 'titleAr')) {
    data.titleAr = normalizeOptionalTextForPatch(params.command.titleAr);
  }

  if (hasOwn(params.command, 'type') && params.command.type !== undefined) {
    data.type = normalizeAssessmentType(params.command.type);
  }

  if (hasOwn(params.command, 'date') && params.command.date !== undefined) {
    data.date = parseAssessmentDate(params.command.date, 'date');
  }

  if (hasOwn(params.command, 'weight') && params.command.weight !== undefined) {
    data.weight = new Prisma.Decimal(
      validateAssessmentWeight(params.command.weight),
    );
  }

  if (
    hasOwn(params.command, 'maxScore') &&
    params.command.maxScore !== undefined
  ) {
    data.maxScore = new Prisma.Decimal(
      validateAssessmentMaxScore(params.command.maxScore),
    );
  }

  if (hasOwn(params.command, 'expectedTimeMinutes')) {
    data.expectedTimeMinutes = params.command.expectedTimeMinutes ?? null;
  }

  return data;
}

export async function assertAssessmentWeightBudget(params: {
  repository: GradesAssessmentsRepository;
  academicYearId: string;
  termId: string;
  subjectId: string;
  assessmentScope: AssessmentScopePayload;
  nextWeight: number;
  excludeAssessmentId?: string;
}): Promise<void> {
  const currentWeightTotal = await params.repository.sumAssessmentWeights({
    academicYearId: params.academicYearId,
    termId: params.termId,
    subjectId: params.subjectId,
    scopeType: params.assessmentScope.scopeType,
    scopeKey: params.assessmentScope.scopeKey,
    excludeAssessmentId: params.excludeAssessmentId,
  });

  assertWeightBudget({
    currentWeightTotal,
    nextWeight: params.nextWeight,
  });
}

export function validateCreateAssessmentValues(params: {
  date: Date;
  weight: number;
  maxScore: number;
  term: TermReferenceRecord;
}): void {
  assertTermWritableForAssessment(params.term);
  validateAssessmentWeight(params.weight);
  validateAssessmentMaxScore(params.maxScore);
  assertDateInsideTerm(params.date, params.term);
}

export function resolveNextAssessmentScopeInput(params: {
  existing: GradeAssessmentRecord;
  command: UpdateGradeAssessmentDto;
}): ScopeCommand & { schoolId: string } {
  return {
    schoolId: params.existing.schoolId,
    scopeType: params.command.scopeType ?? params.existing.scopeType,
    scopeId: params.command.scopeId,
    stageId: hasOwn(params.command, 'stageId')
      ? params.command.stageId
      : params.existing.stageId,
    gradeId: hasOwn(params.command, 'gradeId')
      ? params.command.gradeId
      : params.existing.gradeId,
    sectionId: hasOwn(params.command, 'sectionId')
      ? params.command.sectionId
      : params.existing.sectionId,
    classroomId: hasOwn(params.command, 'classroomId')
      ? params.command.classroomId
      : params.existing.classroomId,
  };
}

export function hasScopePatch(command: UpdateGradeAssessmentDto): boolean {
  return (
    hasOwn(command, 'scopeType') ||
    hasOwn(command, 'scopeId') ||
    hasOwn(command, 'stageId') ||
    hasOwn(command, 'gradeId') ||
    hasOwn(command, 'sectionId') ||
    hasOwn(command, 'classroomId')
  );
}

export function existingAssessmentScope(
  assessment: GradeAssessmentRecord,
): AssessmentScopePayload {
  return {
    scopeType: assessment.scopeType,
    scopeKey: assessment.scopeKey,
    stageId: assessment.stageId,
    gradeId: assessment.gradeId,
    sectionId: assessment.sectionId,
    classroomId: assessment.classroomId,
  };
}

export function detectProtectedAssessmentChanges(params: {
  existing: GradeAssessmentRecord;
  nextSubjectId: string;
  nextScope: AssessmentScopePayload;
  nextMaxScore: number;
}): string[] {
  const changedFields: string[] = [];

  if (params.existing.subjectId !== params.nextSubjectId) {
    changedFields.push('subjectId');
  }

  if (
    !areScopesEqual(existingAssessmentScope(params.existing), params.nextScope)
  ) {
    changedFields.push('scope');
  }

  if (decimalToNumber(params.existing.maxScore) !== params.nextMaxScore) {
    changedFields.push('maxScore');
  }

  return changedFields;
}

export function assertProtectedChangesAllowed(params: {
  gradeItemCount: number;
  changedFields: string[];
}): void {
  assertNoGradeItemsForProtectedAssessmentChange(params);
}

export function shouldValidateWeightBudget(params: {
  existing?: GradeAssessmentRecord;
  nextSubjectId: string;
  nextScope: AssessmentScopePayload;
  nextWeight: number;
}): boolean {
  if (!params.existing) return true;

  return (
    params.existing.subjectId !== params.nextSubjectId ||
    !areScopesEqual(existingAssessmentScope(params.existing), params.nextScope) ||
    decimalToNumber(params.existing.weight) !== params.nextWeight
  );
}

export function parseAssessmentDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationDomainException('Assessment date is invalid', {
      field,
      value,
    });
  }

  return date;
}

export function decimalToNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function summarizeAssessmentForAudit(
  assessment: GradeAssessmentRecord,
) {
  return {
    academicYearId: assessment.academicYearId,
    termId: assessment.termId,
    subjectId: assessment.subjectId,
    scopeType: assessment.scopeType,
    scopeKey: assessment.scopeKey,
    stageId: assessment.stageId,
    gradeId: assessment.gradeId,
    sectionId: assessment.sectionId,
    classroomId: assessment.classroomId,
    titleEn: assessment.titleEn,
    titleAr: assessment.titleAr,
    type: assessment.type,
    deliveryMode: assessment.deliveryMode,
    date: formatDateOnly(assessment.date),
    weight: decimalToNumber(assessment.weight),
    maxScore: decimalToNumber(assessment.maxScore),
    expectedTimeMinutes: assessment.expectedTimeMinutes,
    approvalStatus: assessment.approvalStatus,
    publishedAt: assessment.publishedAt?.toISOString() ?? null,
    publishedById: assessment.publishedById,
    approvedAt: assessment.approvedAt?.toISOString() ?? null,
    approvedById: assessment.approvedById,
    lockedAt: assessment.lockedAt?.toISOString() ?? null,
    lockedById: assessment.lockedById,
    createdById: assessment.createdById,
    deletedAt: assessment.deletedAt?.toISOString() ?? null,
  };
}

export function buildAssessmentAuditEntry(params: {
  scope: GradesScope;
  action: string;
  assessment: GradeAssessmentRecord;
  before?: GradeAssessmentRecord | null;
}) {
  const entry = {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'grades',
    action: params.action,
    resourceType: 'grade_assessment',
    resourceId: params.assessment.id,
    outcome: AuditOutcome.SUCCESS,
    after: summarizeAssessmentForAudit(params.assessment),
  };

  return params.before
    ? { ...entry, before: summarizeAssessmentForAudit(params.before) }
    : entry;
}

function parseAssessmentListDateFilters(input: {
  dateFrom?: string;
  dateTo?: string;
}): { dateFrom?: Date; dateTo?: Date } {
  const dateFrom = input.dateFrom
    ? parseAssessmentDate(input.dateFrom, 'dateFrom')
    : undefined;
  const dateTo = input.dateTo
    ? parseAssessmentDate(input.dateTo, 'dateTo')
    : undefined;

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ValidationDomainException('Invalid assessment date range', {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });
  }

  return { dateFrom, dateTo };
}

function resolveOptionalListScopeKey(
  scopeType: GradeScopeType,
  query: ListGradeAssessmentsQueryDto,
  schoolId: string,
): string | undefined {
  switch (scopeType) {
    case GradeScopeType.SCHOOL:
      return query.scopeId ?? schoolId;
    case GradeScopeType.STAGE:
      return query.stageId ?? query.scopeId;
    case GradeScopeType.GRADE:
      return query.gradeId ?? query.scopeId;
    case GradeScopeType.SECTION:
      return query.sectionId ?? query.scopeId;
    case GradeScopeType.CLASSROOM:
      return query.classroomId ?? query.scopeId;
  }
}

function requireMatchingScopeId(
  field: keyof ScopeCommand,
  input: ScopeCommand,
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
  field: keyof ScopeCommand,
  provided: string | null | undefined,
  actual: string,
): void {
  if (provided && provided !== actual) {
    throw new ValidationDomainException(
      'Assessment context parent ids do not match the selected scope',
      { field },
    );
  }
}

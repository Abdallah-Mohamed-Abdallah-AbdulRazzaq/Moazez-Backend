import { GradeScopeType, Prisma } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireGradesScope } from '../../grades-context';
import {
  GradeAssessmentInvalidScopeException,
  normalizeGradeScopeType,
} from '../../shared/domain/grade-scope';
import { ListGradeRulesQueryDto } from '../dto/list-grade-rules-query.dto';
import { UpsertGradeRuleDto } from '../dto/upsert-grade-rule.dto';
import {
  assertWritableTerm,
  normalizeGradeRoundingMode,
  normalizeGradeRuleScale,
  normalizeRuleScopeForWrite,
  validatePassMark,
} from '../domain/grade-rule-domain';
import {
  GradeRuleRecord,
  GradesRulesRepository,
  TermReferenceRecord,
} from '../infrastructure/grades-rules.repository';

type ScopeIdInput = {
  scopeId?: string | null;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
};

export interface EffectiveRuleRequestScope {
  scopeType: GradeScopeType;
  scopeKey: string;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
}

export function resolveAcademicYearId(input: {
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

export async function validateAcademicRuleContext(
  repository: GradesRulesRepository,
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
      termId,
      academicYearId,
    });
  }

  return { term };
}

export async function buildRuleCreateData(
  repository: GradesRulesRepository,
  command: UpsertGradeRuleDto,
): Promise<Prisma.GradeRuleUncheckedCreateInput> {
  const scope = requireGradesScope();
  const academicYearId = resolveAcademicYearId(command);
  const { term } = await validateAcademicRuleContext(
    repository,
    academicYearId,
    command.termId,
  );
  assertWritableTerm(term);

  const ruleScope = normalizeRuleScopeForWrite({
    schoolId: scope.schoolId,
    scopeType: command.scopeType,
    scopeId: command.scopeId,
    gradeId: command.gradeId,
  });

  if (ruleScope.gradeId) {
    const grade = await repository.findGrade(ruleScope.gradeId);
    if (!grade) {
      throw new NotFoundDomainException('Grade not found', {
        gradeId: ruleScope.gradeId,
      });
    }
  }

  return {
    schoolId: scope.schoolId,
    academicYearId,
    termId: command.termId,
    scopeType: ruleScope.scopeType,
    scopeKey: ruleScope.scopeKey,
    gradeId: ruleScope.gradeId,
    gradingScale: normalizeGradeRuleScale(command.gradingScale),
    passMark: new Prisma.Decimal(validatePassMark(command.passMark)),
    rounding: normalizeGradeRoundingMode(command.rounding),
  };
}

export function buildRuleUpdateData(command: {
  passMark?: number;
  gradingScale?: string;
  rounding?: string;
}): Prisma.GradeRuleUncheckedUpdateInput {
  const data: Prisma.GradeRuleUncheckedUpdateInput = {};

  if (command.passMark !== undefined) {
    data.passMark = new Prisma.Decimal(validatePassMark(command.passMark));
  }

  if (command.gradingScale !== undefined) {
    data.gradingScale = normalizeGradeRuleScale(command.gradingScale);
  }

  if (command.rounding !== undefined) {
    data.rounding = normalizeGradeRoundingMode(command.rounding);
  }

  return data;
}

export function normalizeRuleListFilters(
  query: ListGradeRulesQueryDto,
  schoolId: string,
): {
  academicYearId?: string;
  termId?: string;
  scopeType?: GradeScopeType;
  scopeKey?: string;
  gradeId?: string;
} {
  const scopeType = query.scopeType
    ? normalizeGradeScopeType(query.scopeType)
    : undefined;
  const academicYearId = query.academicYearId ?? query.yearId;

  if (!scopeType) {
    return {
      ...(academicYearId ? { academicYearId } : {}),
      ...(query.termId ? { termId: query.termId } : {}),
      ...((query.gradeId ?? query.scopeId)
        ? { gradeId: query.gradeId ?? query.scopeId }
        : {}),
    };
  }

  return {
    ...(academicYearId ? { academicYearId } : {}),
    ...(query.termId ? { termId: query.termId } : {}),
    scopeType,
    scopeKey: resolveListScopeKey(scopeType, query, schoolId),
    ...(scopeType === GradeScopeType.GRADE
      ? { gradeId: query.gradeId ?? query.scopeId }
      : {}),
  };
}

export async function resolveEffectiveRequestScope(
  repository: GradesRulesRepository,
  input: ScopeIdInput & { scopeType?: string | GradeScopeType | null },
  schoolId: string,
): Promise<EffectiveRuleRequestScope> {
  const scopeType = normalizeGradeScopeType(input.scopeType);

  switch (scopeType) {
    case GradeScopeType.SCHOOL:
      if (input.scopeId && input.scopeId !== schoolId) {
        throw new NotFoundDomainException('School not found', {
          schoolId: input.scopeId,
        });
      }

      return {
        scopeType,
        scopeKey: schoolId,
        stageId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
      };

    case GradeScopeType.STAGE: {
      const stageId = requireMatchingScopeId('stageId', input);
      const stage = await repository.findStage(stageId);
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
      const classroom = await repository.findClassroomWithGrade(classroomId);
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

export function summarizeRuleForAudit(rule: GradeRuleRecord) {
  return {
    academicYearId: rule.academicYearId,
    termId: rule.termId,
    scopeType: rule.scopeType,
    scopeKey: rule.scopeKey,
    gradeId: rule.gradeId,
    gradingScale: rule.gradingScale,
    passMark:
      typeof rule.passMark === 'object' && 'toNumber' in rule.passMark
        ? rule.passMark.toNumber()
        : Number(rule.passMark),
    rounding: rule.rounding,
  };
}

function resolveListScopeKey(
  scopeType: GradeScopeType,
  query: ListGradeRulesQueryDto,
  schoolId: string,
): string | undefined {
  if (scopeType === GradeScopeType.SCHOOL) return schoolId;

  const scopeKey = query.gradeId ?? query.scopeId;
  if (!scopeKey) return undefined;
  return scopeKey;
}

function requireMatchingScopeId(
  field: keyof ScopeIdInput,
  input: ScopeIdInput,
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
  field: keyof ScopeIdInput,
  provided: string | null | undefined,
  actual: string,
): void {
  if (provided && provided !== actual) {
    throw new ValidationDomainException(
      'Grade rule context parent ids do not match the selected scope',
      { field },
    );
  }
}

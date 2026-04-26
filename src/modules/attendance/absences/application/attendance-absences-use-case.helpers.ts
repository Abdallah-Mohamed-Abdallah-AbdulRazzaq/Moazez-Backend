import { AttendanceScopeType } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  AttendanceScopeIds,
  buildScopeKey,
  NormalizedAttendancePolicyScope,
  validateNormalizedScope,
} from '../../policies/domain/policy-scope';
import { parseAttendanceDate } from '../../roll-call/domain/session-key';
import { ListAttendanceAbsencesQueryDto } from '../dto/attendance-absences.dto';
import {
  AttendanceAbsencesRepository,
  ListAttendanceAbsencesFilters,
} from '../infrastructure/attendance-absences.repository';

type AbsenceScopeInput = {
  scopeType: AttendanceScopeType;
  scopeId?: string | null;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
};

export async function buildAttendanceAbsenceFilters(
  repository: AttendanceAbsencesRepository,
  query: ListAttendanceAbsencesQueryDto,
): Promise<ListAttendanceAbsencesFilters> {
  await validateOptionalAttendanceAbsenceContext(repository, query);

  const resolvedScope = await resolveOptionalAttendanceAbsenceScope(
    repository,
    query,
  );
  const dates = resolveAttendanceAbsenceDateFilters(query);

  return {
    academicYearId: query.academicYearId ?? query.yearId,
    termId: query.termId,
    ...dates,
    scopeType: query.scopeType,
    scopeKey: query.scopeKey ?? resolvedScope?.scopeKey,
    stageId: resolvedScope?.stageId ?? query.stageId,
    gradeId: resolvedScope?.gradeId ?? query.gradeId,
    sectionId: resolvedScope?.sectionId ?? query.sectionId,
    classroomId: resolvedScope?.classroomId ?? query.classroomId,
    studentId: query.studentId,
    status: query.status,
  };
}

async function validateOptionalAttendanceAbsenceContext(
  repository: AttendanceAbsencesRepository,
  query: ListAttendanceAbsencesQueryDto,
): Promise<void> {
  const academicYearId = query.academicYearId ?? query.yearId;
  if (academicYearId && query.termId) {
    const [academicYear, term] = await Promise.all([
      repository.findAcademicYearById(academicYearId),
      repository.findTermById(query.termId),
    ]);

    if (!academicYear) {
      throw new NotFoundDomainException('Academic year not found', {
        academicYearId,
      });
    }

    if (!term || term.academicYearId !== academicYearId) {
      throw new NotFoundDomainException('Term not found', {
        academicYearId,
        termId: query.termId,
      });
    }

    return;
  }

  if (academicYearId) {
    const academicYear = await repository.findAcademicYearById(academicYearId);
    if (!academicYear) {
      throw new NotFoundDomainException('Academic year not found', {
        academicYearId,
      });
    }
  }

  if (query.termId) {
    const term = await repository.findTermById(query.termId);
    if (!term) {
      throw new NotFoundDomainException('Term not found', {
        termId: query.termId,
      });
    }
  }
}

async function resolveOptionalAttendanceAbsenceScope(
  repository: AttendanceAbsencesRepository,
  query: ListAttendanceAbsencesQueryDto,
): Promise<NormalizedAttendancePolicyScope | null> {
  if (!query.scopeType || query.scopeKey) {
    return null;
  }

  return resolveAttendanceAbsenceScope(repository, {
    scopeType: query.scopeType,
    scopeId: query.scopeId,
    stageId: query.stageId,
    gradeId: query.gradeId,
    sectionId: query.sectionId,
    classroomId: query.classroomId,
  });
}

async function resolveAttendanceAbsenceScope(
  repository: AttendanceAbsencesRepository,
  input: AbsenceScopeInput,
): Promise<NormalizedAttendancePolicyScope> {
  const requestedIds = extractScopeIds(input);

  switch (input.scopeType) {
    case AttendanceScopeType.SCHOOL:
      rejectIds(requestedIds, [
        'stageId',
        'gradeId',
        'sectionId',
        'classroomId',
      ]);
      return normalizeScope({
        scopeType: AttendanceScopeType.SCHOOL,
      });

    case AttendanceScopeType.STAGE: {
      rejectIds(requestedIds, ['gradeId', 'sectionId', 'classroomId']);
      const stageId = requireId(
        'stageId',
        requestedIds.stageId,
        input.scopeType,
      );
      const stage = await repository.findStageById(stageId);
      if (!stage)
        throw new NotFoundDomainException('Stage not found', { stageId });

      return normalizeScope({
        scopeType: AttendanceScopeType.STAGE,
        stageId: stage.id,
      });
    }

    case AttendanceScopeType.GRADE: {
      rejectIds(requestedIds, ['sectionId', 'classroomId']);
      const gradeId = requireId(
        'gradeId',
        requestedIds.gradeId,
        input.scopeType,
      );
      const grade = await repository.findGradeById(gradeId);
      if (!grade)
        throw new NotFoundDomainException('Grade not found', { gradeId });
      assertOptionalParent('stageId', requestedIds.stageId, grade.stageId);

      return normalizeScope({
        scopeType: AttendanceScopeType.GRADE,
        stageId: grade.stageId,
        gradeId: grade.id,
      });
    }

    case AttendanceScopeType.SECTION: {
      rejectIds(requestedIds, ['classroomId']);
      const sectionId = requireId(
        'sectionId',
        requestedIds.sectionId,
        input.scopeType,
      );
      const section = await repository.findSectionById(sectionId);
      if (!section) {
        throw new NotFoundDomainException('Section not found', { sectionId });
      }
      assertOptionalParent('gradeId', requestedIds.gradeId, section.gradeId);
      assertOptionalParent(
        'stageId',
        requestedIds.stageId,
        section.grade.stageId,
      );

      return normalizeScope({
        scopeType: AttendanceScopeType.SECTION,
        stageId: section.grade.stageId,
        gradeId: section.gradeId,
        sectionId: section.id,
      });
    }

    case AttendanceScopeType.CLASSROOM: {
      const classroomId = requireId(
        'classroomId',
        requestedIds.classroomId,
        input.scopeType,
      );
      const classroom = await repository.findClassroomById(classroomId);
      if (!classroom) {
        throw new NotFoundDomainException('Classroom not found', {
          classroomId,
        });
      }
      assertOptionalParent(
        'sectionId',
        requestedIds.sectionId,
        classroom.sectionId,
      );
      assertOptionalParent(
        'gradeId',
        requestedIds.gradeId,
        classroom.section.gradeId,
      );
      assertOptionalParent(
        'stageId',
        requestedIds.stageId,
        classroom.section.grade.stageId,
      );

      return normalizeScope({
        scopeType: AttendanceScopeType.CLASSROOM,
        stageId: classroom.section.grade.stageId,
        gradeId: classroom.section.gradeId,
        sectionId: classroom.sectionId,
        classroomId: classroom.id,
      });
    }
  }
}

function resolveAttendanceAbsenceDateFilters(
  query: ListAttendanceAbsencesQueryDto,
): {
  date?: Date;
  dateFrom?: Date;
  dateTo?: Date;
} {
  const date = query.date ? parseAttendanceDate(query.date, 'date') : undefined;
  const dateFrom = query.dateFrom
    ? parseAttendanceDate(query.dateFrom, 'dateFrom')
    : undefined;
  const dateTo = query.dateTo
    ? parseAttendanceDate(query.dateTo, 'dateTo')
    : undefined;

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ValidationDomainException(
      'Attendance date range start must be before or equal to end',
      { dateFrom: query.dateFrom, dateTo: query.dateTo },
    );
  }

  return { date, dateFrom, dateTo };
}

function normalizeScope(params: {
  scopeType: AttendanceScopeType;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
}): NormalizedAttendancePolicyScope {
  const scope = {
    scopeType: params.scopeType,
    scopeKey: buildScopeKey(params.scopeType, params),
    stageId: params.stageId ?? null,
    gradeId: params.gradeId ?? null,
    sectionId: params.sectionId ?? null,
    classroomId: params.classroomId ?? null,
  };

  validateNormalizedScope(scope);
  return scope;
}

function extractScopeIds(input: AbsenceScopeInput): AttendanceScopeIds {
  return {
    stageId:
      input.stageId ??
      (input.scopeType === AttendanceScopeType.STAGE ? input.scopeId : null),
    gradeId:
      input.gradeId ??
      (input.scopeType === AttendanceScopeType.GRADE ? input.scopeId : null),
    sectionId:
      input.sectionId ??
      (input.scopeType === AttendanceScopeType.SECTION ? input.scopeId : null),
    classroomId:
      input.classroomId ??
      (input.scopeType === AttendanceScopeType.CLASSROOM
        ? input.scopeId
        : null),
  };
}

function rejectIds(
  ids: AttendanceScopeIds,
  fields: (keyof AttendanceScopeIds)[],
): void {
  const present = fields.filter((field) => Boolean(ids[field]));
  if (present.length > 0) {
    throw new ValidationDomainException(
      'Attendance absence scope contains ids that do not match its scope type',
      { fields: present },
    );
  }
}

function requireId(
  field: keyof AttendanceScopeIds,
  value: string | null | undefined,
  scopeType: AttendanceScopeType,
): string {
  if (!value) {
    throw new ValidationDomainException(
      `${scopeType} attendance absence scope requires ${field}`,
      { scopeType, field },
    );
  }

  return value;
}

function assertOptionalParent(
  field: keyof AttendanceScopeIds,
  provided: string | null | undefined,
  actual: string,
): void {
  if (provided && provided !== actual) {
    throw new ValidationDomainException(
      'Attendance absence scope parent ids do not match the selected scope',
      { field },
    );
  }
}

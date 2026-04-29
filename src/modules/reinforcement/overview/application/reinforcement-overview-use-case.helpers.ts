import { ReinforcementSource } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  assertValidDateRange,
  normalizeOverviewScope,
  normalizeOverviewSource,
  OverviewDateRange,
  ReinforcementOverviewScope,
} from '../domain/reinforcement-overview-domain';
import {
  GetClassroomReinforcementSummaryQueryDto,
  GetReinforcementOverviewQueryDto,
  GetStudentReinforcementProgressQueryDto,
} from '../dto/reinforcement-overview.dto';
import {
  OverviewEnrollmentRecord,
  ReinforcementOverviewReadFilters,
  ReinforcementOverviewRepository,
  OverviewTermRecord,
} from '../infrastructure/reinforcement-overview.repository';

type AcademicContextQuery = {
  academicYearId?: string;
  yearId?: string;
  termId?: string;
};

type ScopeQuery = {
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
  studentId?: string;
  source?: string;
};

export async function resolveOverviewAcademicContext(params: {
  repository: ReinforcementOverviewRepository;
  query: AcademicContextQuery;
}): Promise<{ academicYearId: string; termId: string; term: OverviewTermRecord }> {
  const requestedAcademicYearId =
    params.query.academicYearId ?? params.query.yearId;
  const academicYear = requestedAcademicYearId
    ? await params.repository.findAcademicYear(requestedAcademicYearId)
    : await params.repository.findActiveAcademicYear();

  if (!academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId: requestedAcademicYearId ?? null,
    });
  }

  const term = params.query.termId
    ? await params.repository.findTerm(params.query.termId)
    : await params.repository.findActiveTerm(academicYear.id);

  if (!term || term.academicYearId !== academicYear.id) {
    throw new NotFoundDomainException('Term not found', {
      academicYearId: academicYear.id,
      termId: params.query.termId ?? null,
    });
  }

  return {
    academicYearId: academicYear.id,
    termId: term.id,
    term,
  };
}

export async function buildOverviewReadFilters(params: {
  repository: ReinforcementOverviewRepository;
  schoolId: string;
  query: GetReinforcementOverviewQueryDto;
}): Promise<{
  scope: ReinforcementOverviewScope;
  filters: ReinforcementOverviewReadFilters;
}> {
  const context = await resolveOverviewAcademicContext(params);
  const scope = await resolveOverviewScope({
    repository: params.repository,
    schoolId: params.schoolId,
    academicYearId: context.academicYearId,
    termId: context.termId,
    query: params.query,
  });
  const dateRange = buildOverviewDateRange(params.query);

  return {
    scope,
    filters: {
      academicYearId: context.academicYearId,
      termId: context.termId,
      stageId: scope.stageId,
      gradeId: scope.gradeId,
      sectionId: scope.sectionId,
      classroomId: scope.classroomId,
      studentId: scope.studentId,
      source: scope.source,
      ...dateRange,
    },
  };
}

export async function buildStudentProgressReadFilters(params: {
  repository: ReinforcementOverviewRepository;
  schoolId: string;
  studentId: string;
  query: GetStudentReinforcementProgressQueryDto;
}): Promise<{
  filters: ReinforcementOverviewReadFilters & { studentId: string };
  enrollment: OverviewEnrollmentRecord;
}> {
  const context = await resolveOverviewAcademicContext(params);
  const student = await params.repository.findStudent(params.studentId);
  if (!student) {
    throw new NotFoundDomainException('Student not found', {
      studentId: params.studentId,
    });
  }

  const enrollment = await params.repository.findActiveEnrollmentForStudent({
    studentId: params.studentId,
    academicYearId: context.academicYearId,
    termId: context.termId,
  });
  if (!enrollment) {
    throw new NotFoundDomainException('Student enrollment not found', {
      studentId: params.studentId,
      academicYearId: context.academicYearId,
      termId: context.termId,
    });
  }

  const dateRange = buildOverviewDateRange(params.query);

  return {
    enrollment,
    filters: {
      academicYearId: context.academicYearId,
      termId: context.termId,
      stageId: enrollment.classroom.section.grade.stageId,
      gradeId: enrollment.classroom.section.gradeId,
      sectionId: enrollment.classroom.sectionId,
      classroomId: enrollment.classroomId,
      studentId: params.studentId,
      ...dateRange,
    },
  };
}

export async function buildClassroomSummaryReadFilters(params: {
  repository: ReinforcementOverviewRepository;
  schoolId: string;
  classroomId: string;
  query: GetClassroomReinforcementSummaryQueryDto;
}): Promise<ReinforcementOverviewReadFilters & { classroomId: string }> {
  const context = await resolveOverviewAcademicContext(params);
  const classroom = await params.repository.findClassroom(params.classroomId);
  if (!classroom) {
    throw new NotFoundDomainException('Classroom not found', {
      classroomId: params.classroomId,
    });
  }

  const dateRange = buildOverviewDateRange(params.query);

  return {
    academicYearId: context.academicYearId,
    termId: context.termId,
    stageId: classroom.section.grade.stageId,
    gradeId: classroom.section.gradeId,
    sectionId: classroom.sectionId,
    classroomId: classroom.id,
    ...dateRange,
  };
}

async function resolveOverviewScope(params: {
  repository: ReinforcementOverviewRepository;
  schoolId: string;
  academicYearId: string;
  termId: string;
  query: ScopeQuery;
}): Promise<ReinforcementOverviewScope> {
  const scope = {
    stageId: params.query.stageId ?? null,
    gradeId: params.query.gradeId ?? null,
    sectionId: params.query.sectionId ?? null,
    classroomId: params.query.classroomId ?? null,
    studentId: params.query.studentId ?? null,
  };

  if (scope.stageId) {
    const stage = await params.repository.findStage(scope.stageId);
    if (!stage) {
      throw new NotFoundDomainException('Stage not found', {
        stageId: scope.stageId,
      });
    }
  }

  if (scope.gradeId) {
    const grade = await params.repository.findGrade(scope.gradeId);
    if (!grade) {
      throw new NotFoundDomainException('Grade not found', {
        gradeId: scope.gradeId,
      });
    }
    assertOptionalParent('stageId', scope.stageId, grade.stageId);
    scope.stageId = scope.stageId ?? grade.stageId;
  }

  if (scope.sectionId) {
    const section = await params.repository.findSection(scope.sectionId);
    if (!section) {
      throw new NotFoundDomainException('Section not found', {
        sectionId: scope.sectionId,
      });
    }
    assertOptionalParent('gradeId', scope.gradeId, section.gradeId);
    assertOptionalParent('stageId', scope.stageId, section.grade.stageId);
    scope.gradeId = scope.gradeId ?? section.gradeId;
    scope.stageId = scope.stageId ?? section.grade.stageId;
  }

  if (scope.classroomId) {
    const classroom = await params.repository.findClassroom(scope.classroomId);
    if (!classroom) {
      throw new NotFoundDomainException('Classroom not found', {
        classroomId: scope.classroomId,
      });
    }
    assertOptionalParent('sectionId', scope.sectionId, classroom.sectionId);
    assertOptionalParent('gradeId', scope.gradeId, classroom.section.gradeId);
    assertOptionalParent(
      'stageId',
      scope.stageId,
      classroom.section.grade.stageId,
    );
    scope.sectionId = scope.sectionId ?? classroom.sectionId;
    scope.gradeId = scope.gradeId ?? classroom.section.gradeId;
    scope.stageId = scope.stageId ?? classroom.section.grade.stageId;
  }

  if (scope.studentId) {
    const student = await params.repository.findStudent(scope.studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', {
        studentId: scope.studentId,
      });
    }

    const enrollment = await params.repository.findActiveEnrollmentForStudent({
      studentId: scope.studentId,
      academicYearId: params.academicYearId,
      termId: params.termId,
    });
    if (!enrollment) {
      throw new NotFoundDomainException('Student enrollment not found', {
        studentId: scope.studentId,
        academicYearId: params.academicYearId,
        termId: params.termId,
      });
    }

    assertOptionalParent('classroomId', scope.classroomId, enrollment.classroomId);
    assertOptionalParent('sectionId', scope.sectionId, enrollment.classroom.sectionId);
    assertOptionalParent(
      'gradeId',
      scope.gradeId,
      enrollment.classroom.section.gradeId,
    );
    assertOptionalParent(
      'stageId',
      scope.stageId,
      enrollment.classroom.section.grade.stageId,
    );
    scope.classroomId = scope.classroomId ?? enrollment.classroomId;
    scope.sectionId = scope.sectionId ?? enrollment.classroom.sectionId;
    scope.gradeId = scope.gradeId ?? enrollment.classroom.section.gradeId;
    scope.stageId = scope.stageId ?? enrollment.classroom.section.grade.stageId;
  }

  return normalizeOverviewScope({
    academicYearId: params.academicYearId,
    termId: params.termId,
    ...scope,
    source: resolveSource(params.query.source),
  });
}

function buildOverviewDateRange(query: {
  dateFrom?: string;
  dateTo?: string;
}): OverviewDateRange {
  const dateFrom = query.dateFrom
    ? normalizeDateBoundary(query.dateFrom, 'dateFrom', 'start')
    : undefined;
  const dateTo = query.dateTo
    ? normalizeDateBoundary(query.dateTo, 'dateTo', 'end')
    : undefined;
  const range = { dateFrom, dateTo };
  assertValidDateRange(range);

  return range;
}

function normalizeDateBoundary(
  value: string,
  field: string,
  boundary: 'start' | 'end',
): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationDomainException('Date value is invalid', {
      field,
      value,
    });
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(
      boundary === 'start' ? 0 : 23,
      boundary === 'start' ? 0 : 59,
      boundary === 'start' ? 0 : 59,
      boundary === 'start' ? 0 : 999,
    );
  }

  return date;
}

function resolveSource(source?: string): ReinforcementSource | null {
  return source ? normalizeOverviewSource(source) : null;
}

function assertOptionalParent(
  field: string,
  provided: string | null | undefined,
  actual: string,
): void {
  if (!provided || provided === actual) return;

  throw new ValidationDomainException(
    'Reinforcement overview scope parent ids do not match the selected scope',
    { field },
  );
}

import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireReinforcementScope } from '../../reinforcement-context';
import {
  assertValidHeroDashboardDateRange,
  HeroDashboardDateRange,
  HeroDashboardScope,
  normalizeHeroDashboardScope,
} from '../domain/hero-journey-dashboard-domain';
import {
  GetHeroBadgesSummaryQueryDto,
  GetHeroClassroomSummaryQueryDto,
  GetHeroMapQueryDto,
  GetHeroOverviewQueryDto,
  GetHeroStageSummaryQueryDto,
} from '../dto/hero-journey-dashboard.dto';
import {
  HeroDashboardClassroomRecord,
  HeroDashboardEnrollmentRecord,
  HeroDashboardReadFilters,
  HeroDashboardStageRecord,
  HeroDashboardTermRecord,
  HeroJourneyDashboardRepository,
} from '../infrastructure/hero-journey-dashboard.repository';
import {
  presentHeroBadgeSummary,
  presentHeroClassroomSummary,
  presentHeroMap,
  presentHeroOverview,
  presentHeroStageSummary,
} from '../presenters/hero-journey-dashboard.presenter';

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
  subjectId?: string;
};

type HeroAcademicContext = {
  academicYearId: string;
  termId: string;
  term: HeroDashboardTermRecord;
};

@Injectable()
export class GetHeroOverviewUseCase {
  constructor(
    private readonly dashboardRepository: HeroJourneyDashboardRepository,
  ) {}

  async execute(query: GetHeroOverviewQueryDto) {
    requireReinforcementScope();
    const { scope, filters } = await buildHeroDashboardReadFilters({
      repository: this.dashboardRepository,
      query,
    });
    const dataset =
      await this.dashboardRepository.loadHeroOverviewData(filters);

    return presentHeroOverview({ scope, dataset });
  }
}

@Injectable()
export class GetHeroMapUseCase {
  constructor(
    private readonly dashboardRepository: HeroJourneyDashboardRepository,
  ) {}

  async execute(query: GetHeroMapQueryDto) {
    requireReinforcementScope();
    const context = await resolveHeroAcademicContext({
      repository: this.dashboardRepository,
      query,
    });
    const scope = await resolveHeroMapScope({
      repository: this.dashboardRepository,
      academicYearId: context.academicYearId,
      termId: context.termId,
      query,
    });
    const dataset = await this.dashboardRepository.loadHeroMapData({
      academicYearId: context.academicYearId,
      termId: context.termId,
      stageId: scope.stageId,
      subjectId: scope.subjectId,
      studentId: scope.studentId,
      includeDraft: query.includeDraft ?? false,
      includeArchived: query.includeArchived ?? false,
    });

    return presentHeroMap({
      scope,
      dataset,
      studentId: scope.studentId,
    });
  }
}

@Injectable()
export class GetHeroStageSummaryUseCase {
  constructor(
    private readonly dashboardRepository: HeroJourneyDashboardRepository,
  ) {}

  async execute(stageId: string, query: GetHeroStageSummaryQueryDto) {
    requireReinforcementScope();
    const context = await resolveHeroAcademicContext({
      repository: this.dashboardRepository,
      query,
    });
    const stage = await this.dashboardRepository.findStage(stageId);
    if (!stage) {
      throw new NotFoundDomainException('Stage not found', { stageId });
    }
    const dateRange = buildHeroDashboardDateRange(query);
    const scope = normalizeHeroDashboardScope({
      academicYearId: context.academicYearId,
      termId: context.termId,
      stageId: stage.id,
    });
    const filters = {
      academicYearId: context.academicYearId,
      termId: context.termId,
      stageId: stage.id,
      ...dateRange,
    };
    const dataset =
      await this.dashboardRepository.loadHeroStageSummaryData(filters);

    return presentHeroStageSummary({ scope, stage, dataset });
  }
}

@Injectable()
export class GetHeroClassroomSummaryUseCase {
  constructor(
    private readonly dashboardRepository: HeroJourneyDashboardRepository,
  ) {}

  async execute(classroomId: string, query: GetHeroClassroomSummaryQueryDto) {
    requireReinforcementScope();
    const context = await resolveHeroAcademicContext({
      repository: this.dashboardRepository,
      query,
    });
    const classroom = await this.dashboardRepository.findClassroom(classroomId);
    if (!classroom) {
      throw new NotFoundDomainException('Classroom not found', { classroomId });
    }
    const dateRange = buildHeroDashboardDateRange(query);
    const scope = normalizeHeroDashboardScope({
      academicYearId: context.academicYearId,
      termId: context.termId,
      stageId: classroom.section.grade.stageId,
      gradeId: classroom.section.gradeId,
      sectionId: classroom.sectionId,
      classroomId: classroom.id,
    });
    const filters = {
      academicYearId: context.academicYearId,
      termId: context.termId,
      stageId: classroom.section.grade.stageId,
      gradeId: classroom.section.gradeId,
      sectionId: classroom.sectionId,
      classroomId: classroom.id,
      ...dateRange,
    };
    const dataset =
      await this.dashboardRepository.loadHeroClassroomSummaryData(filters);

    return presentHeroClassroomSummary({ scope, classroom, dataset });
  }
}

@Injectable()
export class GetHeroBadgesSummaryUseCase {
  constructor(
    private readonly dashboardRepository: HeroJourneyDashboardRepository,
  ) {}

  async execute(query: GetHeroBadgesSummaryQueryDto) {
    requireReinforcementScope();
    const context = await resolveHeroAcademicContext({
      repository: this.dashboardRepository,
      query,
    });
    const scope = await resolveHeroBadgeSummaryScope({
      repository: this.dashboardRepository,
      academicYearId: context.academicYearId,
      termId: context.termId,
      query,
    });
    const dataset = await this.dashboardRepository.loadHeroBadgeSummaryData({
      academicYearId: context.academicYearId,
      termId: context.termId,
      stageId: scope.stageId,
      classroomId: scope.classroomId,
      studentId: scope.studentId,
      includeInactive: query.includeInactive ?? false,
    });

    return presentHeroBadgeSummary({
      scope,
      dataset,
      studentId: scope.studentId,
    });
  }
}

async function resolveHeroAcademicContext(params: {
  repository: HeroJourneyDashboardRepository;
  query: AcademicContextQuery;
}): Promise<HeroAcademicContext> {
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

async function buildHeroDashboardReadFilters(params: {
  repository: HeroJourneyDashboardRepository;
  query: GetHeroOverviewQueryDto;
}): Promise<{
  scope: HeroDashboardScope;
  filters: HeroDashboardReadFilters;
}> {
  const context = await resolveHeroAcademicContext(params);
  const scope = await resolveHeroDashboardScope({
    repository: params.repository,
    academicYearId: context.academicYearId,
    termId: context.termId,
    query: params.query,
  });
  const dateRange = buildHeroDashboardDateRange(params.query);

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
      subjectId: scope.subjectId,
      ...dateRange,
    },
  };
}

async function resolveHeroDashboardScope(params: {
  repository: HeroJourneyDashboardRepository;
  academicYearId: string;
  termId: string;
  query: ScopeQuery;
}): Promise<HeroDashboardScope> {
  const scope = {
    stageId: params.query.stageId ?? null,
    gradeId: params.query.gradeId ?? null,
    sectionId: params.query.sectionId ?? null,
    classroomId: params.query.classroomId ?? null,
    studentId: params.query.studentId ?? null,
    subjectId: params.query.subjectId ?? null,
  };

  await validateAcademicScopeHierarchy({
    repository: params.repository,
    academicYearId: params.academicYearId,
    termId: params.termId,
    scope,
  });

  return normalizeHeroDashboardScope({
    academicYearId: params.academicYearId,
    termId: params.termId,
    ...scope,
  });
}

async function resolveHeroMapScope(params: {
  repository: HeroJourneyDashboardRepository;
  academicYearId: string;
  termId: string;
  query: GetHeroMapQueryDto;
}): Promise<HeroDashboardScope> {
  const scope = {
    stageId: params.query.stageId ?? null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
    studentId: params.query.studentId ?? null,
    subjectId: params.query.subjectId ?? null,
  };

  await validateAcademicScopeHierarchy({
    repository: params.repository,
    academicYearId: params.academicYearId,
    termId: params.termId,
    scope,
  });

  return normalizeHeroDashboardScope({
    academicYearId: params.academicYearId,
    termId: params.termId,
    ...scope,
  });
}

async function resolveHeroBadgeSummaryScope(params: {
  repository: HeroJourneyDashboardRepository;
  academicYearId: string;
  termId: string;
  query: GetHeroBadgesSummaryQueryDto;
}): Promise<HeroDashboardScope> {
  const scope = {
    stageId: params.query.stageId ?? null,
    gradeId: null,
    sectionId: null,
    classroomId: params.query.classroomId ?? null,
    studentId: params.query.studentId ?? null,
    subjectId: null,
  };

  await validateAcademicScopeHierarchy({
    repository: params.repository,
    academicYearId: params.academicYearId,
    termId: params.termId,
    scope,
  });

  return normalizeHeroDashboardScope({
    academicYearId: params.academicYearId,
    termId: params.termId,
    ...scope,
  });
}

async function validateAcademicScopeHierarchy(params: {
  repository: HeroJourneyDashboardRepository;
  academicYearId: string;
  termId: string;
  scope: {
    stageId: string | null;
    gradeId: string | null;
    sectionId: string | null;
    classroomId: string | null;
    studentId: string | null;
    subjectId: string | null;
  };
}): Promise<void> {
  const { repository, scope } = params;

  if (scope.stageId) {
    const stage = await repository.findStage(scope.stageId);
    if (!stage) {
      throw new NotFoundDomainException('Stage not found', {
        stageId: scope.stageId,
      });
    }
  }

  if (scope.gradeId) {
    const grade = await repository.findGrade(scope.gradeId);
    if (!grade) {
      throw new NotFoundDomainException('Grade not found', {
        gradeId: scope.gradeId,
      });
    }
    assertOptionalParent('stageId', scope.stageId, grade.stageId);
    scope.stageId = scope.stageId ?? grade.stageId;
  }

  if (scope.sectionId) {
    const section = await repository.findSection(scope.sectionId);
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
    const classroom = await repository.findClassroom(scope.classroomId);
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

  if (scope.subjectId) {
    const subject = await repository.findSubject(scope.subjectId);
    if (!subject) {
      throw new NotFoundDomainException('Subject not found', {
        subjectId: scope.subjectId,
      });
    }
  }

  if (scope.studentId) {
    const student = await repository.findStudent(scope.studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', {
        studentId: scope.studentId,
      });
    }
    const enrollment = await repository.findActiveEnrollmentForStudent({
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
    applyEnrollmentScope(scope, enrollment);
  }
}

function applyEnrollmentScope(
  scope: {
    stageId: string | null;
    gradeId: string | null;
    sectionId: string | null;
    classroomId: string | null;
  },
  enrollment: HeroDashboardEnrollmentRecord,
): void {
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

function buildHeroDashboardDateRange(query: {
  dateFrom?: string;
  dateTo?: string;
}): HeroDashboardDateRange {
  const dateFrom = query.dateFrom
    ? normalizeDateBoundary(query.dateFrom, 'dateFrom', 'start')
    : undefined;
  const dateTo = query.dateTo
    ? normalizeDateBoundary(query.dateTo, 'dateTo', 'end')
    : undefined;
  const range = { dateFrom, dateTo };
  assertValidHeroDashboardDateRange(range);
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

function assertOptionalParent(
  field: string,
  provided: string | null | undefined,
  actual: string,
): void {
  if (!provided || provided === actual) return;

  throw new ValidationDomainException(
    'Hero Journey dashboard scope parent ids do not match the selected scope',
    { field },
  );
}

import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { DashboardScope } from '../dashboard-context';
import {
  DashboardAnalyticsChartDefinition,
  DashboardAnalyticsHierarchyFilterKey,
} from '../domain/dashboard-analytics-catalog';
import {
  DashboardAnalyticsNormalizedQuery,
  DashboardAnalyticsQueryContext,
  DashboardAnalyticsRawQuery,
  DashboardAnalyticsResolvedHierarchy,
  dashboardAnalyticsFilterMetadata,
  explicitlySuppliedDashboardAnalyticsKeys,
  normalizeDashboardAnalyticsQuery,
  rejectDashboardAnalyticsDateBoundsForNonCustomRange,
  resolveDashboardAnalyticsCustomWindow,
  resolveDashboardAnalyticsFixedWindow,
  resolveDashboardAnalyticsPeriodWindow,
  validateDashboardAnalyticsChartQueryCapabilities,
  validateDashboardAnalyticsGranularity,
} from '../domain/dashboard-analytics-query';
import {
  DashboardAnalyticsAcademicYearReference,
  DashboardAnalyticsHierarchyRepository,
  DashboardAnalyticsTermReference,
} from '../infrastructure/dashboard-analytics-hierarchy.repository';
import { DashboardTimeContextService } from './dashboard-time-context.service';

interface ResolvedHierarchyState {
  hierarchy: DashboardAnalyticsResolvedHierarchy;
  academicYear: DashboardAnalyticsAcademicYearReference | null;
  term: DashboardAnalyticsTermReference | null;
}

@Injectable()
export class DashboardAnalyticsQueryContextService {
  constructor(
    private readonly dashboardTimeContextService: DashboardTimeContextService,
    private readonly dashboardAnalyticsHierarchyRepository: DashboardAnalyticsHierarchyRepository,
  ) {}

  async resolve(
    scope: DashboardScope,
    chart: DashboardAnalyticsChartDefinition,
    rawQuery: DashboardAnalyticsRawQuery,
    generatedAt?: Date,
  ): Promise<DashboardAnalyticsQueryContext> {
    const query = normalizeDashboardAnalyticsQuery(rawQuery);
    const explicitlySuppliedKeys =
      explicitlySuppliedDashboardAnalyticsKeys(rawQuery);

    validateDashboardAnalyticsChartQueryCapabilities(
      chart,
      query,
      explicitlySuppliedKeys,
    );
    rejectDashboardAnalyticsDateBoundsForNonCustomRange(query);
    validateHierarchyUuids(query, explicitlySuppliedKeys);

    const timeContext = await this.dashboardTimeContextService.resolveForSchool(
      scope,
      generatedAt,
    );
    const hierarchyState = await this.resolveHierarchy(scope, chart, query);
    const window = await this.resolveWindow(
      scope,
      query,
      timeContext,
      hierarchyState,
    );

    if (chart.queryCapabilities.granularityApplicable) {
      validateDashboardAnalyticsGranularity(query.granularity, window);
    }

    const filterMetadata = dashboardAnalyticsFilterMetadata(
      chart,
      explicitlySuppliedKeys,
      hierarchyState.hierarchy,
    );

    return {
      generatedAt: timeContext.generatedAt,
      timezone: timeContext.timezone,
      range: query.range,
      granularity: query.granularity,
      startInclusive: window.startInclusive,
      endExclusive: window.endExclusive,
      startCivilDate: window.startCivilDate,
      endCivilDate: window.endCivilDate,
      hierarchy: hierarchyState.hierarchy,
      explicitlySuppliedKeys,
      filtersApplied: filterMetadata.applied,
      filtersNotApplicable: filterMetadata.notApplicable,
    };
  }

  private async resolveHierarchy(
    scope: DashboardScope,
    chart: DashboardAnalyticsChartDefinition,
    query: DashboardAnalyticsNormalizedQuery,
  ): Promise<ResolvedHierarchyState> {
    const repository = this.dashboardAnalyticsHierarchyRepository;
    const [academicYear, term, grade, section, classroom] = await Promise.all([
      query.academicYearId
        ? repository.findAcademicYearById(scope, query.academicYearId)
        : null,
      query.termId ? repository.findTermById(scope, query.termId) : null,
      query.gradeId ? repository.findGradeById(scope, query.gradeId) : null,
      query.sectionId
        ? repository.findSectionById(scope, query.sectionId)
        : null,
      query.classroomId
        ? repository.findClassroomById(scope, query.classroomId)
        : null,
    ]);

    if (
      (query.academicYearId && !academicYear) ||
      (query.termId && !term) ||
      (query.gradeId && !grade) ||
      (query.sectionId && !section) ||
      (query.classroomId && !classroom)
    ) {
      throw hierarchyNotFound();
    }

    if (
      (academicYear && term && term.academicYearId !== academicYear.id) ||
      (grade && section && section.gradeId !== grade.id) ||
      (section && classroom && classroom.sectionId !== section.id) ||
      (grade && classroom && classroom.gradeId !== grade.id)
    ) {
      throw hierarchyNotFound();
    }

    let resolvedAcademicYear = academicYear;
    let resolvedTerm = term;
    let academicYearId = academicYear?.id ?? term?.academicYearId ?? null;
    let termId = term?.id ?? null;
    let gradeId = grade?.id ?? section?.gradeId ?? classroom?.gradeId ?? null;
    let sectionId = section?.id ?? classroom?.sectionId ?? null;
    const classroomId = classroom?.id ?? null;

    const supportsAcademicContext =
      chart.queryCapabilities.supportedHierarchyFilters.includes(
        'academicYearId',
      ) || chart.queryCapabilities.supportedHierarchyFilters.includes('termId');

    if (
      supportsAcademicContext &&
      chart.queryCapabilities.snapshotOnly &&
      !query.academicYearId &&
      !query.termId &&
      query.range !== 'term' &&
      query.range !== 'academic_year'
    ) {
      resolvedAcademicYear = await repository.findActiveAcademicYear(scope);
      resolvedTerm = await repository.findActiveTerm(
        scope,
        resolvedAcademicYear?.id,
      );
      academicYearId =
        resolvedAcademicYear?.id ?? resolvedTerm?.academicYearId ?? null;
      termId = resolvedTerm?.id ?? null;
      if (chart.source === 'grades' && !resolvedTerm) {
        academicYearId = null;
      }
    }

    if (query.range === 'term' && !resolvedTerm) {
      resolvedTerm = await repository.findActiveTerm(
        scope,
        academicYearId ?? undefined,
      );
      if (!resolvedTerm) throw hierarchyNotFound();
      termId = resolvedTerm.id;
      academicYearId = academicYearId ?? resolvedTerm.academicYearId;
    }

    if (query.range === 'academic_year' && !resolvedAcademicYear) {
      const academicYearToResolve = academicYearId;
      resolvedAcademicYear = academicYearToResolve
        ? await repository.findAcademicYearById(scope, academicYearToResolve)
        : await repository.findActiveAcademicYear(scope);
      if (!resolvedAcademicYear) throw hierarchyNotFound();
      academicYearId = resolvedAcademicYear.id;
    }

    if (
      resolvedTerm &&
      academicYearId &&
      resolvedTerm.academicYearId !== academicYearId
    ) {
      throw hierarchyNotFound();
    }

    return {
      academicYear: resolvedAcademicYear,
      term: resolvedTerm,
      hierarchy: {
        academicYearId,
        termId,
        gradeId,
        sectionId,
        classroomId,
      },
    };
  }

  private async resolveWindow(
    scope: DashboardScope,
    query: DashboardAnalyticsNormalizedQuery,
    timeContext: Awaited<
      ReturnType<DashboardTimeContextService['resolveForSchool']>
    >,
    hierarchyState: ResolvedHierarchyState,
  ) {
    if (
      query.range === '7d' ||
      query.range === '30d' ||
      query.range === '90d'
    ) {
      return resolveDashboardAnalyticsFixedWindow(query.range, timeContext);
    }
    if (query.range === 'custom') {
      return resolveDashboardAnalyticsCustomWindow(query, timeContext);
    }

    if (query.range === 'term') {
      const term = hierarchyState.term;
      if (!term) throw hierarchyNotFound();
      const window = resolveDashboardAnalyticsPeriodWindow(
        term.startDate,
        term.endDate,
        timeContext,
      );
      if (!window) throw hierarchyNotFound();
      return window;
    }

    let academicYear = hierarchyState.academicYear;
    if (!academicYear && hierarchyState.hierarchy.academicYearId) {
      academicYear =
        await this.dashboardAnalyticsHierarchyRepository.findAcademicYearById(
          scope,
          hierarchyState.hierarchy.academicYearId,
        );
    }
    if (!academicYear) throw hierarchyNotFound();
    const window = resolveDashboardAnalyticsPeriodWindow(
      academicYear.startDate,
      academicYear.endDate,
      timeContext,
    );
    if (!window) throw hierarchyNotFound();
    return window;
  }
}

function validateHierarchyUuids(
  query: DashboardAnalyticsNormalizedQuery,
  explicitlySuppliedKeys: readonly string[],
): void {
  const hierarchyKeys: DashboardAnalyticsHierarchyFilterKey[] = [
    'academicYearId',
    'termId',
    'gradeId',
    'sectionId',
    'classroomId',
  ];
  const malformed = hierarchyKeys.filter(
    (key) =>
      explicitlySuppliedKeys.includes(key) &&
      query[key] !== null &&
      !isUUID(query[key]!),
  );

  if (malformed.length > 0) {
    throw new ValidationDomainException('Analytics hierarchy id is invalid', {
      fields: malformed,
    });
  }
}

function hierarchyNotFound(): NotFoundDomainException {
  return new NotFoundDomainException(
    'Dashboard analytics hierarchy was not found',
  );
}

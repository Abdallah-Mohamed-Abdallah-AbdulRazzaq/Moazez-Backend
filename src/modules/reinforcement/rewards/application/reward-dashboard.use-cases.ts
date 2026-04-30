import { Injectable } from '@nestjs/common';
import { RewardCatalogItemStatus } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireReinforcementScope } from '../../reinforcement-context';
import {
  normalizeRewardCatalogStatus,
  normalizeRewardCatalogType,
} from '../domain/reward-catalog-domain';
import {
  assertValidRewardDashboardDateRange,
  RewardDashboardDateRange,
} from '../domain/reward-dashboard-domain';
import { normalizeRewardRedemptionStatus } from '../domain/reward-redemptions-domain';
import {
  GetRewardCatalogSummaryQueryDto,
  GetRewardsOverviewQueryDto,
  GetStudentRewardsSummaryQueryDto,
} from '../dto/reward-dashboard.dto';
import {
  RewardDashboardRepository,
  RewardDashboardTermRecord,
} from '../infrastructure/reward-dashboard.repository';
import {
  presentRewardCatalogSummary,
  presentRewardsOverview,
  presentStudentRewardsSummary,
  RewardDashboardResponseScope,
} from '../presenters/reward-dashboard.presenter';

type AcademicContextQuery = {
  academicYearId?: string;
  termId?: string;
};

type RewardsAcademicContext = {
  academicYearId: string | null;
  termId: string | null;
  term: RewardDashboardTermRecord | null;
};

@Injectable()
export class GetRewardsOverviewUseCase {
  constructor(
    private readonly rewardDashboardRepository: RewardDashboardRepository,
  ) {}

  async execute(query: GetRewardsOverviewQueryDto) {
    requireReinforcementScope();
    const context = await resolveRewardsAcademicContext({
      repository: this.rewardDashboardRepository,
      query,
    });
    const dateRange = buildRewardDashboardDateRange(query);

    if (query.studentId) {
      await validateStudentOwnership({
        repository: this.rewardDashboardRepository,
        studentId: query.studentId,
      });
    }

    const dataset = await this.rewardDashboardRepository.loadRewardsOverviewData({
      academicYearId: context.academicYearId,
      termId: context.termId,
      studentId: query.studentId ?? null,
      status: query.status
        ? normalizeRewardRedemptionStatus(query.status)
        : null,
      type: query.type ? normalizeRewardCatalogType(query.type) : null,
      includeArchived: query.includeArchived ?? false,
      ...dateRange,
    });

    return presentRewardsOverview({
      scope: buildResponseScope({
        academicYearId: context.academicYearId,
        termId: context.termId,
        studentId: query.studentId ?? null,
        ...dateRange,
      }),
      dataset,
    });
  }
}

@Injectable()
export class GetStudentRewardsSummaryUseCase {
  constructor(
    private readonly rewardDashboardRepository: RewardDashboardRepository,
  ) {}

  async execute(studentId: string, query: GetStudentRewardsSummaryQueryDto) {
    requireReinforcementScope();
    const context = await resolveRewardsAcademicContext({
      repository: this.rewardDashboardRepository,
      query,
    });
    const dateRange = buildRewardDashboardDateRange(query);
    const includeCatalogEligibility =
      query.includeCatalogEligibility ?? true;
    const includeHistory = query.includeHistory ?? true;

    const dataset =
      await this.rewardDashboardRepository.loadStudentRewardsSummaryData({
        studentId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        includeCatalogEligibility,
        ...dateRange,
      });
    if (!dataset) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    return presentStudentRewardsSummary({
      scope: buildResponseScope({
        academicYearId: context.academicYearId,
        termId: context.termId,
        studentId,
        ...dateRange,
      }),
      dataset,
      includeCatalogEligibility,
      includeHistory,
    });
  }
}

@Injectable()
export class GetRewardCatalogSummaryUseCase {
  constructor(
    private readonly rewardDashboardRepository: RewardDashboardRepository,
  ) {}

  async execute(query: GetRewardCatalogSummaryQueryDto) {
    requireReinforcementScope();
    const context = await resolveRewardsAcademicContext({
      repository: this.rewardDashboardRepository,
      query,
    });
    const dateRange = buildRewardDashboardDateRange(query);
    const status = query.status
      ? normalizeRewardCatalogStatus(query.status)
      : null;

    const dataset =
      await this.rewardDashboardRepository.loadRewardCatalogSummaryData({
        academicYearId: context.academicYearId,
        termId: context.termId,
        status,
        type: query.type ? normalizeRewardCatalogType(query.type) : null,
        includeArchived:
          query.includeArchived ??
          status === RewardCatalogItemStatus.ARCHIVED,
        includeDeleted: query.includeDeleted ?? false,
        onlyAvailable: query.onlyAvailable ?? false,
        ...dateRange,
      });

    return presentRewardCatalogSummary({
      scope: buildResponseScope({
        academicYearId: context.academicYearId,
        termId: context.termId,
        ...dateRange,
      }),
      dataset,
    });
  }
}

async function resolveRewardsAcademicContext(params: {
  repository: RewardDashboardRepository;
  query: AcademicContextQuery;
}): Promise<RewardsAcademicContext> {
  const [academicYear, term] = await Promise.all([
    params.query.academicYearId
      ? params.repository.findAcademicYear(params.query.academicYearId)
      : Promise.resolve(null),
    params.query.termId
      ? params.repository.findTerm(params.query.termId)
      : Promise.resolve(null),
  ]);

  if (params.query.academicYearId && !academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId: params.query.academicYearId,
    });
  }

  if (params.query.termId && !term) {
    throw new NotFoundDomainException('Term not found', {
      termId: params.query.termId,
    });
  }

  if (
    params.query.academicYearId &&
    term &&
    term.academicYearId !== params.query.academicYearId
  ) {
    throw new NotFoundDomainException('Term not found', {
      academicYearId: params.query.academicYearId,
      termId: params.query.termId,
    });
  }

  return {
    academicYearId:
      params.query.academicYearId ?? term?.academicYearId ?? null,
    termId: params.query.termId ?? null,
    term,
  };
}

async function validateStudentOwnership(params: {
  repository: RewardDashboardRepository;
  studentId: string;
}): Promise<void> {
  const student = await params.repository.findStudent(params.studentId);
  if (!student) {
    throw new NotFoundDomainException('Student not found', {
      studentId: params.studentId,
    });
  }
}

function buildRewardDashboardDateRange(query: {
  dateFrom?: string;
  dateTo?: string;
}): RewardDashboardDateRange {
  const dateFrom = query.dateFrom
    ? normalizeDateBoundary(query.dateFrom, 'dateFrom', 'start')
    : undefined;
  const dateTo = query.dateTo
    ? normalizeDateBoundary(query.dateTo, 'dateTo', 'end')
    : undefined;
  const range = { dateFrom, dateTo };
  assertValidRewardDashboardDateRange(range);
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

function buildResponseScope(
  scope: RewardDashboardResponseScope,
): RewardDashboardResponseScope {
  return {
    academicYearId: scope.academicYearId ?? null,
    termId: scope.termId ?? null,
    studentId: scope.studentId ?? null,
    dateFrom: scope.dateFrom ?? null,
    dateTo: scope.dateTo ?? null,
  };
}

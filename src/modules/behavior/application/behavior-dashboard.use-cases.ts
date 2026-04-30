import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { requireBehaviorScope } from '../behavior-context';
import {
  assertValidBehaviorDashboardDateRange,
  normalizeBehaviorDashboardScope,
} from '../domain/behavior-dashboard-domain';
import {
  BehaviorScopeInvalidException,
  normalizeBehaviorRecordStatus,
  normalizeBehaviorRecordType,
  normalizeBehaviorSeverity,
  parseBehaviorIsoDate,
} from '../domain/behavior-records-domain';
import {
  GetBehaviorOverviewQueryDto,
  GetClassroomBehaviorSummaryQueryDto,
  GetStudentBehaviorSummaryQueryDto,
} from '../dto/behavior-dashboard.dto';
import {
  BehaviorDashboardReadFilters,
  BehaviorDashboardRepository,
  BehaviorDashboardTermRecord,
} from '../infrastructure/behavior-dashboard.repository';
import {
  presentBehaviorOverview,
  presentClassroomBehaviorSummary,
  presentStudentBehaviorSummary,
} from '../presenters/behavior-dashboard.presenter';

@Injectable()
export class GetBehaviorOverviewUseCase {
  constructor(
    private readonly behaviorDashboardRepository: BehaviorDashboardRepository,
  ) {}

  async execute(query: GetBehaviorOverviewQueryDto) {
    requireBehaviorScope();
    const filters = await buildDashboardReadFilters({
      repository: this.behaviorDashboardRepository,
      query,
    });
    const dataset =
      await this.behaviorDashboardRepository.loadBehaviorOverviewData(filters);

    return presentBehaviorOverview({
      scope: normalizeBehaviorDashboardScope(filters),
      dataset,
      includeRecentActivity: query.includeRecentActivity ?? true,
      includeTopCategories: query.includeTopCategories ?? true,
    });
  }
}

@Injectable()
export class GetStudentBehaviorSummaryUseCase {
  constructor(
    private readonly behaviorDashboardRepository: BehaviorDashboardRepository,
  ) {}

  async execute(studentId: string, query: GetStudentBehaviorSummaryQueryDto) {
    requireBehaviorScope();
    const filters = await buildDashboardReadFilters({
      repository: this.behaviorDashboardRepository,
      query: { ...query, studentId },
      requireStudent: true,
    });
    const dataset =
      await this.behaviorDashboardRepository.loadStudentBehaviorSummaryData({
        ...filters,
        studentId,
      });

    if (!dataset) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    return presentStudentBehaviorSummary({
      scope: normalizeBehaviorDashboardScope(filters),
      dataset,
      includeTimeline: query.includeTimeline ?? true,
      includeCategoryBreakdown: query.includeCategoryBreakdown ?? true,
      includeLedger: query.includeLedger ?? true,
    });
  }
}

@Injectable()
export class GetClassroomBehaviorSummaryUseCase {
  constructor(
    private readonly behaviorDashboardRepository: BehaviorDashboardRepository,
  ) {}

  async execute(
    classroomId: string,
    query: GetClassroomBehaviorSummaryQueryDto,
  ) {
    requireBehaviorScope();
    const filters = await buildDashboardReadFilters({
      repository: this.behaviorDashboardRepository,
      query: { ...query, classroomId },
      requireClassroom: true,
    });
    const dataset =
      await this.behaviorDashboardRepository.loadClassroomBehaviorSummaryData({
        ...filters,
        classroomId,
      });

    if (!dataset) {
      throw new NotFoundDomainException('Classroom not found', { classroomId });
    }

    return presentClassroomBehaviorSummary({
      scope: normalizeBehaviorDashboardScope(filters),
      dataset,
      includeStudents: query.includeStudents ?? true,
      includeCategoryBreakdown: query.includeCategoryBreakdown ?? true,
      includeRecentActivity: query.includeRecentActivity ?? true,
    });
  }
}

async function buildDashboardReadFilters(params: {
  repository: BehaviorDashboardRepository;
  query: {
    academicYearId?: string;
    termId?: string;
    studentId?: string;
    classroomId?: string;
    type?: string;
    severity?: string;
    status?: string;
    occurredFrom?: string;
    occurredTo?: string;
  };
  requireStudent?: boolean;
  requireClassroom?: boolean;
}): Promise<BehaviorDashboardReadFilters> {
  const query = params.query;

  if (query.academicYearId) {
    await requireAcademicYear(params.repository, query.academicYearId);
  }

  let term: BehaviorDashboardTermRecord | null = null;
  if (query.termId) {
    term = await requireTerm(params.repository, query.termId);
    if (query.academicYearId && term.academicYearId !== query.academicYearId) {
      throw new BehaviorScopeInvalidException({
        academicYearId: query.academicYearId,
        termId: query.termId,
      });
    }
  }

  if (query.studentId || params.requireStudent) {
    await requireStudent(params.repository, String(query.studentId));
  }

  if (query.classroomId || params.requireClassroom) {
    await requireClassroom(params.repository, String(query.classroomId));
  }

  const occurredFrom = query.occurredFrom
    ? parseBehaviorIsoDate(query.occurredFrom, 'occurredFrom')
    : null;
  const occurredTo = query.occurredTo
    ? parseBehaviorIsoDate(query.occurredTo, 'occurredTo')
    : null;
  assertValidBehaviorDashboardDateRange({ occurredFrom, occurredTo });

  return {
    academicYearId: query.academicYearId ?? null,
    termId: query.termId ?? null,
    enrollmentAcademicYearId:
      query.academicYearId ?? term?.academicYearId ?? null,
    studentId: query.studentId ?? null,
    classroomId: query.classroomId ?? null,
    type: query.type ? normalizeBehaviorRecordType(query.type) : null,
    severity: query.severity ? normalizeBehaviorSeverity(query.severity) : null,
    status: query.status ? normalizeBehaviorRecordStatus(query.status) : null,
    occurredFrom,
    occurredTo,
  };
}

async function requireAcademicYear(
  repository: BehaviorDashboardRepository,
  academicYearId: string,
) {
  const academicYear = await repository.findAcademicYear(academicYearId);
  if (!academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId,
    });
  }

  return academicYear;
}

async function requireTerm(
  repository: BehaviorDashboardRepository,
  termId: string,
): Promise<BehaviorDashboardTermRecord> {
  const term = await repository.findTerm(termId);
  if (!term) {
    throw new NotFoundDomainException('Term not found', { termId });
  }

  return term;
}

async function requireStudent(
  repository: BehaviorDashboardRepository,
  studentId: string,
) {
  const student = await repository.findStudent(studentId);
  if (!student) {
    throw new NotFoundDomainException('Student not found', { studentId });
  }

  return student;
}

async function requireClassroom(
  repository: BehaviorDashboardRepository,
  classroomId: string,
) {
  const classroom = await repository.findClassroom(classroomId);
  if (!classroom) {
    throw new NotFoundDomainException('Classroom not found', { classroomId });
  }

  return classroom;
}

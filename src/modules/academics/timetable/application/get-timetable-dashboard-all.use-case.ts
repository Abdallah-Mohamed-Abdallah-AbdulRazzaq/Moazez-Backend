import { Injectable } from '@nestjs/common';
import { TimetablePublicationStatus, TimetableScopeType } from '@prisma/client';
import { requireAcademicsScope } from '../../academics-context';
import { TimetableDashboardQueryDto } from '../dto/timetable.dto';
import {
  TimetableDashboardAllResponseDto,
  TimetableDashboardConfigSummaryDto,
} from '../dto/timetable-response.dto';
import {
  TimetableClassroomRecord,
  TimetableConfigRecord,
  TimetableEntryRecord,
  TimetableGradeRecord,
  TimetablePeriodRecord,
  TimetablePublicationRecord,
  TimetableRepository,
} from '../infrastructure/timetable.repository';
import {
  presentTimetableEntry,
  presentTimetablePeriod,
} from '../presenters/timetable.presenter';
import {
  groupBy,
  resolveReadableTimetableContext,
  unique,
} from './timetable-dashboard.helpers';

@Injectable()
export class GetTimetableDashboardAllUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    query: TimetableDashboardQueryDto,
  ): Promise<TimetableDashboardAllResponseDto> {
    requireAcademicsScope();

    const { term, classroom } = await resolveReadableTimetableContext(
      this.timetableRepository,
      query,
    );
    const [configs, entries] = await Promise.all([
      this.timetableRepository.listConfigsByTerm(term.id),
      this.timetableRepository.listEntriesByTerm({
        termId: term.id,
        gradeId: query.gradeId,
        classroomId: query.classroomId,
      }),
    ]);
    const classroomGradeIds = unique([
      ...(classroom ? [classroom.section.gradeId] : []),
      ...(query.gradeId ? [query.gradeId] : []),
      ...entries.map((entry) => entry.gradeId),
    ]);
    const selectedClassrooms = classroom
      ? [classroom]
      : await this.timetableRepository.listClassroomsByGradeIds(
          classroomGradeIds,
        );
    const selectedGradeIds = unique([
      ...selectedClassrooms.map((item) => item.section.gradeId),
      ...entries.map((entry) => entry.gradeId),
    ]);
    const [periods, publications, grades] = await Promise.all([
      this.timetableRepository.listPeriodsByConfigIds(
        unique(configs.map((config) => config.id)),
      ),
      this.timetableRepository.findLatestPublicationsByConfigIds(
        unique(configs.map((config) => config.id)),
      ),
      this.timetableRepository.listGradesByIds(selectedGradeIds),
    ]);

    const publishedPublications = latestPublicationsByConfig(publications);
    const latestPublishedAt = latestPublishedTimestamp(
      [...publishedPublications.values()].filter(
        (publication) =>
          publication.status === TimetablePublicationStatus.PUBLISHED,
      ),
    );

    return {
      termId: term.id,
      academicYearId: term.academicYearId,
      publishedAt: latestPublishedAt?.toISOString() ?? null,
      isPublished: Boolean(latestPublishedAt),
      items: buildDashboardItems({
        configs,
        periods,
        entries,
        classrooms: selectedClassrooms,
        grades,
      }),
    };
  }
}

function buildDashboardItems(input: {
  configs: TimetableConfigRecord[];
  periods: TimetablePeriodRecord[];
  entries: TimetableEntryRecord[];
  classrooms: TimetableClassroomRecord[];
  grades: TimetableGradeRecord[];
}): TimetableDashboardAllResponseDto['items'] {
  const entriesByClassroomId = groupBy(
    input.entries,
    (entry) => entry.classroomId,
  );
  const periodsByConfigId = groupBy(
    input.periods,
    (period) => period.timetableConfigId,
  );
  const configById = new Map(input.configs.map((config) => [config.id, config]));
  const gradeById = new Map(input.grades.map((grade) => [grade.id, grade]));

  return input.classrooms.map((classroom) => {
    const classroomId = classroom.id;
    const entries = entriesByClassroomId.get(classroomId) ?? [];
    const gradeId = classroom.section.gradeId;
    const grade = gradeById.get(gradeId);
    const classroomConfigs = unique([
      ...input.configs
        .filter((config) => configAppliesToClassroom(config, classroom))
        .map((config) => config.id),
      ...entries.map((entry) => entry.timetableConfigId),
    ])
      .map((configId) => configById.get(configId))
      .filter((config): config is TimetableConfigRecord => Boolean(config));
    const classroomPeriods = classroomConfigs.flatMap(
      (config) => periodsByConfigId.get(config.id) ?? [],
    );

    return {
      classroomId,
      classroom: {
        id: classroomId,
        nameAr: classroom.nameAr,
        nameEn: classroom.nameEn,
      },
      gradeId,
      grade: {
        id: gradeId,
        nameAr: grade?.nameAr ?? '',
        nameEn: grade?.nameEn ?? '',
      },
      configs: classroomConfigs.map(presentDashboardConfig),
      periods: classroomPeriods.map((period) => presentTimetablePeriod(period)),
      entries: entries.map((entry) => presentTimetableEntry(entry)),
    };
  });
}

function configAppliesToClassroom(
  config: TimetableConfigRecord,
  classroom: TimetableClassroomRecord,
): boolean {
  if (config.scopeType === TimetableScopeType.TERM) return true;
  if (config.scopeType === TimetableScopeType.GRADE) {
    return config.gradeId === classroom.section.gradeId;
  }
  if (config.scopeType === TimetableScopeType.SECTION) {
    return config.sectionId === classroom.sectionId;
  }
  if (config.scopeType === TimetableScopeType.CLASSROOM) {
    return config.classroomId === classroom.id;
  }
  return false;
}

function presentDashboardConfig(
  config: TimetableConfigRecord,
): TimetableDashboardConfigSummaryDto {
  return {
    id: config.id,
    name: config.name,
    scopeType: config.scopeType.toLowerCase(),
    scopeKey: config.scopeKey,
    status: config.status.toLowerCase(),
    activeDays: config.activeDays,
  };
}

function latestPublicationsByConfig(
  publications: TimetablePublicationRecord[],
): Map<string, TimetablePublicationRecord> {
  const result = new Map<string, TimetablePublicationRecord>();
  for (const publication of publications) {
    const current = result.get(publication.timetableConfigId);
    if (!current || publication.revision > current.revision) {
      result.set(publication.timetableConfigId, publication);
    }
  }
  return result;
}

function latestPublishedTimestamp(
  publications: TimetablePublicationRecord[],
): Date | null {
  return publications.reduce<Date | null>((latest, publication) => {
    if (!publication.publishedAt) return latest;
    if (!latest || publication.publishedAt > latest) {
      return publication.publishedAt;
    }
    return latest;
  }, null);
}

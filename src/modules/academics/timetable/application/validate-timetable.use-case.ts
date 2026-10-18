import { Injectable } from '@nestjs/common';
import { TimetableEntryStatus } from '@prisma/client';
import { isUUID } from 'class-validator';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { classroomMatchesTimetableConfigScope } from '../domain/timetable-policy';
import {
  TimetableClassroomNotFoundException,
  TimetableClassroomScopeMismatchException,
  TimetableConfigNotFoundException,
} from '../domain/timetable.exceptions';
import { ValidateTimetableQueryDto } from '../dto/timetable.dto';
import { TimetableValidationResponseDto } from '../dto/timetable-response.dto';
import {
  TimetableRepository,
  TimetableTermRecord,
} from '../infrastructure/timetable.repository';
import {
  resolveReadableTimetableContext,
  unique,
} from './timetable-dashboard.helpers';
import { loadTimetablePublicationDataset } from './timetable-publication-readiness';
import { resolveTimetableScope } from './timetable-use-case.helpers';
import { buildAuthoritativeTimetableValidation } from './timetable-validation';

@Injectable()
export class ValidateTimetableUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    query: ValidateTimetableQueryDto,
  ): Promise<TimetableValidationResponseDto> {
    const scope = requireAcademicsScope();

    if (query.timetableConfigId !== undefined) {
      if (
        typeof query.timetableConfigId !== 'string' ||
        !isUUID(query.timetableConfigId) ||
        query.gradeId !== undefined ||
        query.classroomId !== undefined
      ) {
        throw new ValidationDomainException(
          'An exact timetableConfigId must be a UUID and cannot be combined with gradeId or classroomId',
        );
      }

      const { term } = await resolveReadableTimetableContext(
        this.timetableRepository,
        { termId: query.termId },
      );
      return this.validateConfiguration(
        query.timetableConfigId,
        term,
        scope.schoolId,
      );
    }

    const { term, classroom } = await resolveReadableTimetableContext(
      this.timetableRepository,
      query,
    );
    const subjectAllocations =
      await this.timetableRepository.listSubjectAllocationsForTerm({
        termId: term.id,
        gradeId: classroom?.section.gradeId ?? query.gradeId,
      });
    const classrooms = classroom
      ? [classroom]
      : query.gradeId
        ? await this.timetableRepository.listClassroomsByGradeIds([
            query.gradeId,
          ])
        : await this.timetableRepository.listClassrooms();
    const selectedGradeIds = unique([
      ...subjectAllocations.map((allocation) => allocation.gradeId),
      ...classrooms.map((item) => item.section.gradeId),
    ]);
    const [grades, teacherAllocations, termEntries] = await Promise.all([
      this.timetableRepository.listGradesByIds(selectedGradeIds),
      this.timetableRepository.listTeacherAllocationsByTerm({
        termId: term.id,
        gradeId: query.gradeId,
        classroomId: query.classroomId,
      }),
      this.timetableRepository.listEntriesByTerm({ termId: term.id }),
    ]);
    const selectedEntries = termEntries.filter(
      (entry) =>
        (!query.gradeId || entry.gradeId === query.gradeId) &&
        (!query.classroomId || entry.classroomId === query.classroomId),
    );
    const rooms = await this.timetableRepository.findRoomsByIds(
      unique(
        selectedEntries
          .filter((entry) => entry.status !== TimetableEntryStatus.CANCELLED)
          .map((entry) => entry.roomId)
          .filter((roomId): roomId is string => roomId !== null),
      ),
    );

    return buildAuthoritativeTimetableValidation({
      termId: term.id,
      academicYearId: term.academicYearId,
      classrooms,
      grades,
      subjectAllocations,
      teacherAllocations,
      entries: selectedEntries,
      conflictEntries: termEntries,
      rooms,
    }).response;
  }

  private async validateConfiguration(
    timetableConfigId: string,
    term: TimetableTermRecord,
    schoolId: string,
  ): Promise<TimetableValidationResponseDto> {
    const config =
      await this.timetableRepository.findConfigById(timetableConfigId);
    if (
      !config ||
      config.schoolId !== schoolId ||
      term.schoolId !== schoolId ||
      config.termId !== term.id ||
      config.academicYearId !== term.academicYearId
    ) {
      throw new TimetableConfigNotFoundException({ timetableConfigId });
    }

    const canonicalScope = await resolveTimetableScope(
      this.timetableRepository,
      {
        academicYearId: config.academicYearId,
        termId: config.termId,
        scopeType: config.scopeType,
        stageId: config.stageId ?? undefined,
        gradeId: config.gradeId ?? undefined,
        sectionId: config.sectionId ?? undefined,
        classroomId: config.classroomId ?? undefined,
      },
    );
    if (
      config.scopeKey !== canonicalScope.scopeKey ||
      config.stageId !== canonicalScope.stageId ||
      config.gradeId !== canonicalScope.gradeId ||
      config.sectionId !== canonicalScope.sectionId ||
      config.classroomId !== canonicalScope.classroomId
    ) {
      throw new ValidationDomainException('Timetable config scope is invalid', {
        timetableConfigId,
      });
    }

    const dataset = await loadTimetablePublicationDataset(
      this.timetableRepository,
      config,
    );
    const classroomsById = new Map(
      dataset.allClassrooms.map((classroom) => [classroom.id, classroom]),
    );
    for (const entry of dataset.entries) {
      if (
        entry.schoolId !== schoolId ||
        entry.timetableConfigId !== config.id ||
        entry.termId !== term.id ||
        entry.academicYearId !== term.academicYearId
      ) {
        throw new ValidationDomainException(
          'Timetable entry academic context does not match its configuration',
          { timetableConfigId },
        );
      }
      const classroom = classroomsById.get(entry.classroomId);
      if (!classroom) {
        throw new TimetableClassroomNotFoundException({
          timetableConfigId,
          classroomId: entry.classroomId,
        });
      }
      if (
        !classroomMatchesTimetableConfigScope(config, classroom) ||
        entry.gradeId !== classroom.section.gradeId ||
        entry.sectionId !== classroom.sectionId
      ) {
        throw new TimetableClassroomScopeMismatchException({
          timetableConfigId,
          classroomId: classroom.id,
        });
      }
    }

    return { ...dataset.validation.response, timetableConfigId: config.id };
  }
}

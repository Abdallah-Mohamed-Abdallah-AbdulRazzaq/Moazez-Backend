import { Injectable } from '@nestjs/common';
import { TimetableEntryStatus } from '@prisma/client';
import { requireAcademicsScope } from '../../academics-context';
import { TimetableDashboardQueryDto } from '../dto/timetable.dto';
import { TimetableValidationResponseDto } from '../dto/timetable-response.dto';
import { TimetableRepository } from '../infrastructure/timetable.repository';
import {
  resolveReadableTimetableContext,
  unique,
} from './timetable-dashboard.helpers';
import { buildAuthoritativeTimetableValidation } from './timetable-validation';

@Injectable()
export class ValidateTimetableUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    query: TimetableDashboardQueryDto,
  ): Promise<TimetableValidationResponseDto> {
    requireAcademicsScope();

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
}

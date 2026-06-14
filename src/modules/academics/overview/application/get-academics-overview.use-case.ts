import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { AcademicsOverviewInvalidContextException } from '../domain/academics-overview.exceptions';
import { AcademicsOverviewQueryDto } from '../dto/academics-overview-query.dto';
import { AcademicsOverviewResponseDto } from '../dto/academics-overview-response.dto';
import {
  AcademicsOverviewAcademicYearRecord,
  AcademicsOverviewRepository,
  AcademicsOverviewTermRecord,
} from '../infrastructure/academics-overview.repository';
import {
  EMPTY_ACADEMICS_OVERVIEW_COUNTS,
  presentAcademicsOverview,
} from '../presenters/academics-overview.presenter';

interface ResolvedAcademicContext {
  academicYear: AcademicsOverviewAcademicYearRecord | null;
  term: AcademicsOverviewTermRecord | null;
}

@Injectable()
export class GetAcademicsOverviewUseCase {
  constructor(private readonly repository: AcademicsOverviewRepository) {}

  async execute(
    query: AcademicsOverviewQueryDto,
  ): Promise<AcademicsOverviewResponseDto> {
    requireAcademicsScope();

    const generatedAt = new Date();
    const context = await this.resolveAcademicContext(query);

    if (!context.academicYear) {
      return presentAcademicsOverview({
        generatedAt,
        academicYear: null,
        term: null,
        counts: EMPTY_ACADEMICS_OVERVIEW_COUNTS,
        upcomingEvents: [],
      });
    }

    const contextFilter = {
      academicYearId: context.academicYear.id,
      ...(context.term ? { termId: context.term.id } : {}),
    };

    const [
      structure,
      subjects,
      rooms,
      teacherAllocation,
      curriculum,
      lessonPlans,
      timetable,
      calendar,
      upcomingEvents,
    ] = await Promise.all([
      this.repository.countStructure(),
      this.repository.countSubjects(),
      this.repository.countRooms(),
      this.repository.countTeacherAllocations(contextFilter),
      this.repository.countCurriculum(contextFilter),
      this.repository.countLessonPlans(contextFilter),
      this.repository.countTimetable(contextFilter),
      this.repository.countCalendarEvents(contextFilter, generatedAt),
      this.repository.listUpcomingCalendarEvents(contextFilter, generatedAt, 5),
    ]);

    return presentAcademicsOverview({
      generatedAt,
      academicYear: context.academicYear,
      term: context.term,
      counts: {
        structure,
        subjects,
        rooms,
        teacherAllocation,
        curriculum,
        lessonPlans,
        timetable,
        calendar,
      },
      upcomingEvents,
    });
  }

  private async resolveAcademicContext(
    query: AcademicsOverviewQueryDto,
  ): Promise<ResolvedAcademicContext> {
    let academicYear: AcademicsOverviewAcademicYearRecord | null = null;
    let term: AcademicsOverviewTermRecord | null = null;

    if (query.academicYearId) {
      academicYear = await this.repository.findAcademicYearById(
        query.academicYearId,
      );
      if (!academicYear) {
        throw new AcademicsOverviewInvalidContextException({
          academicYearId: query.academicYearId,
        });
      }
    }

    if (query.termId) {
      term = await this.repository.findTermById(query.termId);
      if (!term) {
        throw new AcademicsOverviewInvalidContextException({
          termId: query.termId,
        });
      }

      if (academicYear && term.academicYearId !== academicYear.id) {
        throw new AcademicsOverviewInvalidContextException({
          academicYearId: academicYear.id,
          termId: term.id,
        });
      }

      if (!academicYear) {
        academicYear = await this.repository.findAcademicYearById(
          term.academicYearId,
        );
        if (!academicYear) {
          throw new AcademicsOverviewInvalidContextException({
            academicYearId: term.academicYearId,
            termId: term.id,
          });
        }
      }
    }

    if (!academicYear) {
      academicYear = await this.repository.findActiveAcademicYear();
    }

    if (!academicYear) {
      return { academicYear: null, term: null };
    }

    if (!term) {
      term = await this.repository.findActiveTermForYear(academicYear.id);
    }

    return { academicYear, term };
  }
}

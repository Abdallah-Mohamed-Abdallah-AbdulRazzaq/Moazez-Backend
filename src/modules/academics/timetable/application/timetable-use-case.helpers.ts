import { TimetableScopeType } from '@prisma/client';
import {
  ValidationDomainException,
  NotFoundDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import {
  DEFAULT_TIMETABLE_SCOPE_TYPE,
  assertTermWritable,
} from '../domain/timetable-policy';
import { TimetableRepository } from '../infrastructure/timetable.repository';

export interface TimetableScopeInput {
  academicYearId: string;
  termId: string;
  scopeType?: TimetableScopeType;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
}

export interface ResolvedTimetableScope {
  schoolId: string;
  academicYearId: string;
  termId: string;
  scopeType: TimetableScopeType;
  scopeKey: string;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
}

export async function resolveTimetableScope(
  repository: TimetableRepository,
  input: TimetableScopeInput,
  options?: { requireWritableTerm?: boolean },
): Promise<ResolvedTimetableScope> {
  const scope = requireAcademicsScope();
  const academicYear = await repository.findAcademicYearById(
    input.academicYearId,
  );
  if (!academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId: input.academicYearId,
    });
  }

  const term = await repository.findTermById(input.termId);
  if (!term || term.academicYearId !== academicYear.id) {
    throw new NotFoundDomainException('Term not found', {
      termId: input.termId,
      academicYearId: input.academicYearId,
    });
  }

  if (options?.requireWritableTerm) {
    assertTermWritable(term);
  }

  const scopeType = input.scopeType ?? DEFAULT_TIMETABLE_SCOPE_TYPE;
  if (scopeType === TimetableScopeType.TERM) {
    return {
      schoolId: scope.schoolId,
      academicYearId: academicYear.id,
      termId: term.id,
      scopeType,
      scopeKey: `term:${term.id}`,
      stageId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
    };
  }

  if (scopeType === TimetableScopeType.STAGE) {
    if (!input.stageId) {
      throw new ValidationDomainException(
        'stageId is required for stage timetable scope',
        {
          field: 'stageId',
        },
      );
    }

    const stage = await repository.findStageById(input.stageId);
    if (!stage) {
      throw new NotFoundDomainException('Stage not found', {
        stageId: input.stageId,
      });
    }

    return {
      schoolId: scope.schoolId,
      academicYearId: academicYear.id,
      termId: term.id,
      scopeType,
      scopeKey: `stage:${stage.id}`,
      stageId: stage.id,
      gradeId: null,
      sectionId: null,
      classroomId: null,
    };
  }

  if (scopeType === TimetableScopeType.GRADE) {
    if (!input.gradeId) {
      throw new ValidationDomainException(
        'gradeId is required for grade timetable scope',
        {
          field: 'gradeId',
        },
      );
    }

    const grade = await repository.findGradeById(input.gradeId);
    if (!grade || (input.stageId && input.stageId !== grade.stageId)) {
      throw new NotFoundDomainException('Grade not found', {
        gradeId: input.gradeId,
      });
    }

    return {
      schoolId: scope.schoolId,
      academicYearId: academicYear.id,
      termId: term.id,
      scopeType,
      scopeKey: `grade:${grade.id}`,
      stageId: grade.stageId,
      gradeId: grade.id,
      sectionId: null,
      classroomId: null,
    };
  }

  if (scopeType === TimetableScopeType.SECTION) {
    if (!input.sectionId) {
      throw new ValidationDomainException(
        'sectionId is required for section timetable scope',
        {
          field: 'sectionId',
        },
      );
    }

    const section = await repository.findSectionById(input.sectionId);
    if (
      !section ||
      (input.gradeId && input.gradeId !== section.gradeId) ||
      (input.stageId && input.stageId !== section.grade.stageId)
    ) {
      throw new NotFoundDomainException('Section not found', {
        sectionId: input.sectionId,
      });
    }

    return {
      schoolId: scope.schoolId,
      academicYearId: academicYear.id,
      termId: term.id,
      scopeType,
      scopeKey: `section:${section.id}`,
      stageId: section.grade.stageId,
      gradeId: section.gradeId,
      sectionId: section.id,
      classroomId: null,
    };
  }

  if (scopeType !== TimetableScopeType.CLASSROOM) {
    throw new ValidationDomainException('Timetable scope type is invalid', {
      field: 'scopeType',
      scopeType,
    });
  }

  if (!input.classroomId) {
    throw new ValidationDomainException(
      'classroomId is required for classroom timetable scope',
      {
        field: 'classroomId',
      },
    );
  }

  const classroom = await repository.findClassroomById(input.classroomId);
  if (
    !classroom ||
    (input.sectionId && input.sectionId !== classroom.sectionId) ||
    (input.gradeId && input.gradeId !== classroom.section.gradeId) ||
    (input.stageId && input.stageId !== classroom.section.grade.stageId)
  ) {
    throw new NotFoundDomainException('Classroom not found', {
      classroomId: input.classroomId,
    });
  }

  return {
    schoolId: scope.schoolId,
    academicYearId: academicYear.id,
    termId: term.id,
    scopeType,
    scopeKey: `classroom:${classroom.id}`,
    stageId: classroom.section.grade.stageId,
    gradeId: classroom.section.gradeId,
    sectionId: classroom.sectionId,
    classroomId: classroom.id,
  };
}

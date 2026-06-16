import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { ValidateTeacherAllocationsQueryDto } from '../dto/teacher-allocation.dto';
import {
  TeacherAllocationValidationItemDto,
  TeacherAllocationValidationIssueDto,
  TeacherAllocationValidationResponseDto,
} from '../dto/teacher-allocation-response.dto';
import { TeacherAllocationInvalidScopeException } from '../domain/teacher-allocation.exceptions';
import {
  ClassroomReferenceRecord,
  SubjectAllocationMatrixRecord,
  TeacherAllocationRecord,
  TeacherAllocationRepository,
} from '../infrastructure/teacher-allocation.repository';
import { unique } from './teacher-allocation-use-case.helpers';

@Injectable()
export class ValidateTeacherAllocationsUseCase {
  constructor(
    private readonly teacherAllocationRepository: TeacherAllocationRepository,
  ) {}

  async execute(
    query: ValidateTeacherAllocationsQueryDto,
  ): Promise<TeacherAllocationValidationResponseDto> {
    requireAcademicsScope();

    const term = await this.teacherAllocationRepository.findTermById(
      query.termId,
    );
    if (!term) {
      throw new TeacherAllocationInvalidScopeException({ termId: query.termId });
    }

    const [grade, subject] = await Promise.all([
      query.gradeId
        ? this.teacherAllocationRepository.findGradeById(query.gradeId)
        : Promise.resolve(null),
      query.subjectId
        ? this.teacherAllocationRepository.findSubjectById(query.subjectId)
        : Promise.resolve(null),
    ]);
    if (query.gradeId && !grade) {
      throw new TeacherAllocationInvalidScopeException({
        gradeId: query.gradeId,
      });
    }
    if (query.subjectId && !subject) {
      throw new TeacherAllocationInvalidScopeException({
        subjectId: query.subjectId,
      });
    }

    const [subjectAllocations, teacherAllocations] = await Promise.all([
      this.teacherAllocationRepository.listSubjectAllocationsForValidation({
        termId: term.id,
        gradeId: query.gradeId,
        subjectId: query.subjectId,
      }),
      this.teacherAllocationRepository.listAllocationsForValidation({
        termId: term.id,
        gradeId: query.gradeId,
        subjectId: query.subjectId,
      }),
    ]);

    const gradeIds =
      subjectAllocations.length > 0
        ? unique(subjectAllocations.map((row) => row.gradeId))
        : query.gradeId
          ? [query.gradeId]
          : [];
    const classrooms =
      await this.teacherAllocationRepository.findClassroomsByGradeIds(gradeIds);

    const items =
      subjectAllocations.length > 0
        ? buildValidationItems(subjectAllocations, classrooms, teacherAllocations)
        : buildMissingMatrixItems({
            grade,
            subject,
            classrooms,
            requestedGradeId: query.gradeId,
            requestedSubjectId: query.subjectId,
          });

    const missingTeacherAssignments = items.reduce(
      (sum, item) => sum + item.missingClassroomCount,
      0,
    );
    const missingSubjectAllocationRows = items.filter(
      (item) => item.status === 'missing_subject_allocation',
    ).length;

    return {
      termId: term.id,
      academicYearId: term.academicYearId,
      summary: {
        gradesChecked: gradeIds.length,
        subjectAllocationRows: subjectAllocations.length,
        teacherAllocationRows: teacherAllocations.length,
        missingTeacherAssignments,
        missingSubjectAllocationRows,
        overAllocatedSubjects: items.filter((item) =>
          item.issues.some((issue) => issue.code === 'over_allocated_subject'),
        ).length,
        underAllocatedSubjects: items.filter((item) =>
          item.issues.some(
            (issue) => issue.code === 'missing_teacher_allocation',
          ),
        ).length,
      },
      items,
    };
  }
}

function buildValidationItems(
  subjectAllocations: SubjectAllocationMatrixRecord[],
  classrooms: ClassroomReferenceRecord[],
  teacherAllocations: TeacherAllocationRecord[],
): TeacherAllocationValidationItemDto[] {
  const classroomsByGradeId = groupBy(classrooms, (classroom) =>
    classroom.section.gradeId,
  );
  const allocationsByMatrixKey = groupBy(
    teacherAllocations,
    (allocation) =>
      `${allocation.classroom.section.gradeId}:${allocation.subjectId}`,
  );

  return subjectAllocations.map((row) => {
    const gradeClassrooms = classroomsByGradeId.get(row.gradeId) ?? [];
    const rowAllocations =
      allocationsByMatrixKey.get(`${row.gradeId}:${row.subjectId}`) ?? [];
    const allocationsByClassroomId = groupBy(
      rowAllocations,
      (allocation) => allocation.classroomId,
    );
    const missingClassroomIds = gradeClassrooms
      .filter(
        (classroom) =>
          (allocationsByClassroomId.get(classroom.id) ?? []).length === 0,
      )
      .map((classroom) => classroom.id);
    const overAllocatedClassroomIds = gradeClassrooms
      .filter(
        (classroom) =>
          (allocationsByClassroomId.get(classroom.id) ?? []).length > 1,
      )
      .map((classroom) => classroom.id);
    const issues: TeacherAllocationValidationIssueDto[] = [];

    if (missingClassroomIds.length > 0) {
      issues.push({
        code: 'missing_teacher_allocation',
        message:
          'Subject is missing teacher allocation for one or more classrooms.',
        classroomIds: missingClassroomIds,
      });
    }
    if (overAllocatedClassroomIds.length > 0) {
      issues.push({
        code: 'over_allocated_subject',
        message:
          'Subject has more than one teacher allocation for one or more classrooms.',
        classroomIds: overAllocatedClassroomIds,
      });
    }

    return {
      gradeId: row.gradeId,
      grade: {
        id: row.grade.id,
        nameAr: row.grade.nameAr,
        nameEn: row.grade.nameEn,
      },
      subjectId: row.subjectId,
      subject: {
        id: row.subject.id,
        nameAr: row.subject.nameAr,
        nameEn: row.subject.nameEn,
        code: row.subject.code ?? null,
        color: row.subject.color ?? null,
      },
      weeklyHours: row.weeklyHours,
      classroomCount: gradeClassrooms.length,
      allocatedClassroomCount: gradeClassrooms.length - missingClassroomIds.length,
      missingClassroomCount: missingClassroomIds.length,
      status: issues.length > 0 ? 'incomplete' : 'complete',
      issues,
    };
  });
}

function buildMissingMatrixItems(input: {
  grade: { id: string; nameAr: string; nameEn: string } | null;
  subject: {
    id: string;
    nameAr: string;
    nameEn: string;
    code: string | null;
    color: string | null;
  } | null;
  classrooms: ClassroomReferenceRecord[];
  requestedGradeId?: string;
  requestedSubjectId?: string;
}): TeacherAllocationValidationItemDto[] {
  if (!input.requestedGradeId && !input.requestedSubjectId) {
    return [];
  }

  return [
    {
      gradeId: input.grade?.id ?? input.requestedGradeId ?? null,
      grade: input.grade
        ? {
            id: input.grade.id,
            nameAr: input.grade.nameAr,
            nameEn: input.grade.nameEn,
          }
        : null,
      subjectId: input.subject?.id ?? input.requestedSubjectId ?? null,
      subject: input.subject
        ? {
            id: input.subject.id,
            nameAr: input.subject.nameAr,
            nameEn: input.subject.nameEn,
            code: input.subject.code ?? null,
            color: input.subject.color ?? null,
          }
        : null,
      weeklyHours: null,
      classroomCount: input.classrooms.length,
      allocatedClassroomCount: 0,
      missingClassroomCount: 0,
      status: 'missing_subject_allocation',
      issues: [
        {
          code: 'missing_subject_allocation_row',
          message:
            'Subject allocation weekly-hours row is missing for the selected scope.',
          classroomIds: input.classrooms.map((classroom) => classroom.id),
        },
      ],
    },
  ];
}

function groupBy<T>(
  items: T[],
  getKey: (item: T) => string,
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    result.set(key, [...(result.get(key) ?? []), item]);
  }
  return result;
}

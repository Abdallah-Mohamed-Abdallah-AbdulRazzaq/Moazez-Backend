import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { TeacherLoadsQueryDto } from '../dto/teacher-allocation.dto';
import {
  TeacherLoadItemDto,
  TeacherLoadWarningDto,
  TeacherLoadsResponseDto,
} from '../dto/teacher-allocation-response.dto';
import { TeacherAllocationInvalidScopeException } from '../domain/teacher-allocation.exceptions';
import {
  SubjectAllocationMatrixRecord,
  TeacherAllocationRecord,
  TeacherAllocationRepository,
} from '../infrastructure/teacher-allocation.repository';
import {
  assertActiveTeacher,
  subjectAllocationKey,
  unique,
} from './teacher-allocation-use-case.helpers';

@Injectable()
export class GetTeacherLoadsUseCase {
  constructor(
    private readonly teacherAllocationRepository: TeacherAllocationRepository,
  ) {}

  async execute(query: TeacherLoadsQueryDto): Promise<TeacherLoadsResponseDto> {
    requireAcademicsScope();

    const term = await this.teacherAllocationRepository.findTermById(
      query.termId,
    );
    if (!term) {
      throw new TeacherAllocationInvalidScopeException({ termId: query.termId });
    }

    if (query.teacherUserId) {
      assertActiveTeacher(
        await this.teacherAllocationRepository.findActiveMembershipByUserId(
          query.teacherUserId,
        ),
        query.teacherUserId,
      );
    }

    const allocations =
      await this.teacherAllocationRepository.listAllocationsForTeacherLoads({
        termId: term.id,
        teacherUserId: query.teacherUserId,
      });
    const matrixKeys = unique(
      allocations.map((allocation) =>
        subjectAllocationKey(
          allocation.classroom.section.gradeId,
          allocation.subjectId,
        ),
      ),
    ).map((key) => {
      const [gradeId, subjectId] = key.split(':');
      return { gradeId, subjectId };
    });
    const subjectAllocations =
      await this.teacherAllocationRepository.findSubjectAllocationsByKeys(
        term.id,
        matrixKeys,
      );

    return {
      termId: term.id,
      academicYearId: term.academicYearId,
      items: buildTeacherLoadItems(allocations, subjectAllocations),
    };
  }
}

function buildTeacherLoadItems(
  allocations: TeacherAllocationRecord[],
  subjectAllocations: SubjectAllocationMatrixRecord[],
): TeacherLoadItemDto[] {
  const matrixByKey = new Map(
    subjectAllocations.map((row) => [
      subjectAllocationKey(row.gradeId, row.subjectId),
      row,
    ]),
  );
  const allocationsByTeacher = groupBy(
    allocations,
    (allocation) => allocation.teacherUserId,
  );

  return Array.from(allocationsByTeacher.entries()).map(
    ([teacherUserId, teacherAllocations]) => {
      const teacher = teacherAllocations[0].teacherUser;
      const warnings: TeacherLoadWarningDto[] = [];
      const loads = teacherAllocations.map((allocation) => {
        const grade = allocation.classroom.section.grade;
        const matrix = matrixByKey.get(
          subjectAllocationKey(grade.id, allocation.subjectId),
        );
        if (!matrix) {
          warnings.push({
            code: 'missing_subject_allocation_weekly_hours',
            message:
              'Teacher allocation is missing a subject allocation weekly-hours row.',
            allocationId: allocation.id,
            subjectId: allocation.subjectId,
            classroomId: allocation.classroomId,
          });
        }

        return {
          allocationId: allocation.id,
          subjectId: allocation.subjectId,
          subject: {
            id: allocation.subject.id,
            nameAr: allocation.subject.nameAr,
            nameEn: allocation.subject.nameEn,
            code: allocation.subject.code ?? null,
            color: allocation.subject.color ?? null,
          },
          classroomId: allocation.classroomId,
          classroom: {
            id: allocation.classroom.id,
            nameAr: allocation.classroom.nameAr,
            nameEn: allocation.classroom.nameEn,
          },
          gradeId: grade.id,
          grade: {
            id: grade.id,
            nameAr: grade.nameAr,
            nameEn: grade.nameEn,
          },
          weeklyHours: matrix?.weeklyHours ?? null,
        };
      });

      return {
        teacherUserId,
        teacher: {
          id: teacher.id,
          firstName: teacher.firstName,
          lastName: teacher.lastName,
        },
        allocationCount: teacherAllocations.length,
        totalWeeklyHours: loads.reduce(
          (sum, load) => sum + (load.weeklyHours ?? 0),
          0,
        ),
        classroomsCount: new Set(
          teacherAllocations.map((allocation) => allocation.classroomId),
        ).size,
        subjectsCount: new Set(
          teacherAllocations.map((allocation) => allocation.subjectId),
        ).size,
        loads,
        warnings,
      };
    },
  );
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

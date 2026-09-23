import { Injectable } from '@nestjs/common';
import {
  AcademicContentTargetScopeType as Scope,
  UserType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentRecord } from '../infrastructure/academic-content.repository';
import { NormalizedAcademicContentTarget } from '../domain/academic-content-target.policy';

@Injectable()
export class AcademicContentTargetValidator {
  constructor(private readonly prisma: PrismaService) {}

  async validate(
    content: AcademicContentRecord,
    targets: readonly NormalizedAcademicContentTarget[],
    actor: { id: string; userType: UserType },
  ): Promise<void> {
    for (const target of targets) {
      const gradeIds = await this.resolveGrades(content.schoolId, target);
      if (target.subjectId) {
        const subject = await this.prisma.subject.findFirst({
          where: {
            id: target.subjectId,
            schoolId: content.schoolId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!subject)
          throw new ValidationDomainException('Target subject is unavailable');
        const allocation = await this.prisma.subjectAllocation.findFirst({
          where: {
            schoolId: content.schoolId,
            academicYearId: content.academicYearId,
            termId: content.termId,
            gradeId: { in: gradeIds },
            subjectId: target.subjectId,
            weeklyHours: { gt: 0 },
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!allocation)
          throw new ValidationDomainException(
            'Subject is not taught in the target scope',
          );
      }
      if (target.teacherSubjectAllocationId) {
        const allocation = await this.prisma.teacherSubjectAllocation.findFirst(
          {
            where: {
              id: target.teacherSubjectAllocationId,
              schoolId: content.schoolId,
              termId: content.termId,
              classroomId: target.classroomId!,
              subjectId: target.subjectId!,
              term: {
                academicYearId: content.academicYearId,
                schoolId: content.schoolId,
                deletedAt: null,
              },
            },
            select: { teacherUserId: true },
          },
        );
        if (
          !allocation ||
          (actor.userType === UserType.TEACHER &&
            allocation.teacherUserId !== actor.id)
        ) {
          throw new ValidationDomainException(
            'Teacher subject allocation is unavailable or not owned',
          );
        }
      }
    }
  }

  private async resolveGrades(
    schoolId: string,
    target: NormalizedAcademicContentTarget,
  ): Promise<string[]> {
    if (target.scopeType === Scope.SCHOOL || target.scopeType === Scope.STAGE) {
      if (target.scopeType === Scope.STAGE) {
        const stage = await this.prisma.stage.findFirst({
          where: { id: target.stageId!, schoolId, deletedAt: null },
          select: { id: true },
        });
        if (!stage)
          throw new ValidationDomainException('Target stage is unavailable');
      }
      const grades = await this.prisma.grade.findMany({
        where: {
          schoolId,
          deletedAt: null,
          stageId: target.stageId ?? undefined,
          stage: { deletedAt: null },
        },
        select: { id: true },
      });
      return grades.map((grade) => grade.id);
    }
    if (target.scopeType === Scope.GRADE) {
      const grade = await this.prisma.grade.findFirst({
        where: {
          id: target.gradeId!,
          schoolId,
          deletedAt: null,
          stage: { deletedAt: null },
        },
        select: { id: true },
      });
      if (!grade)
        throw new ValidationDomainException('Target grade is unavailable');
      return [grade.id];
    }
    if (target.scopeType === Scope.SECTION) {
      const section = await this.prisma.section.findFirst({
        where: {
          id: target.sectionId!,
          schoolId,
          deletedAt: null,
          grade: { deletedAt: null, stage: { deletedAt: null } },
        },
        select: { gradeId: true },
      });
      if (!section)
        throw new ValidationDomainException('Target section is unavailable');
      return [section.gradeId];
    }
    const classroom = await this.prisma.classroom.findFirst({
      where: {
        id: target.classroomId!,
        schoolId,
        deletedAt: null,
        section: {
          deletedAt: null,
          grade: { deletedAt: null, stage: { deletedAt: null } },
        },
      },
      select: { section: { select: { gradeId: true } } },
    });
    if (!classroom)
      throw new ValidationDomainException('Target classroom is unavailable');
    return [classroom.section.gradeId];
  }
}

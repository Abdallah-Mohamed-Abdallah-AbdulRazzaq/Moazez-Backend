import { Injectable } from '@nestjs/common';
import {
  AcademicContentTargetScopeType as Scope,
  UserType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { AcademicContentRecord } from '../infrastructure/academic-content.repository';
import { AcademicContentValidationRepository } from '../infrastructure/academic-content-validation.repository';
import { NormalizedAcademicContentTarget } from '../domain/academic-content-target.policy';

@Injectable()
export class AcademicContentTargetValidator {
  constructor(
    private readonly validation: AcademicContentValidationRepository,
  ) {}

  async validate(
    content: AcademicContentRecord,
    targets: readonly NormalizedAcademicContentTarget[],
    actor: { id: string; userType: UserType },
  ): Promise<void> {
    for (const target of targets) {
      const gradeIds = await this.resolveGrades(content.schoolId, target);
      if (target.subjectId) {
        const subject = await this.validation.findSubject(
          target.subjectId,
          content.schoolId,
        );
        if (!subject)
          throw new ValidationDomainException('Target subject is unavailable');
        const allocation = await this.validation.findSubjectAllocation({
          schoolId: content.schoolId,
          academicYearId: content.academicYearId,
          termId: content.termId,
          gradeIds,
          subjectId: target.subjectId,
        });
        if (!allocation)
          throw new ValidationDomainException(
            'Subject is not taught in the target scope',
          );
      }
      if (target.teacherSubjectAllocationId) {
        const allocation = await this.validation.findTeacherAllocation({
          id: target.teacherSubjectAllocationId,
          schoolId: content.schoolId,
          academicYearId: content.academicYearId,
          termId: content.termId,
          classroomId: target.classroomId!,
          subjectId: target.subjectId!,
        });
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
        const stage = await this.validation.findStage(
          target.stageId!,
          schoolId,
        );
        if (!stage)
          throw new ValidationDomainException('Target stage is unavailable');
      }
      const grades = await this.validation.findGrades(
        schoolId,
        target.stageId ?? undefined,
      );
      return grades.map((grade) => grade.id);
    }
    if (target.scopeType === Scope.GRADE) {
      const grade = await this.validation.findGrade(target.gradeId!, schoolId);
      if (!grade)
        throw new ValidationDomainException('Target grade is unavailable');
      return [grade.id];
    }
    if (target.scopeType === Scope.SECTION) {
      const section = await this.validation.findSection(
        target.sectionId!,
        schoolId,
      );
      if (!section)
        throw new ValidationDomainException('Target section is unavailable');
      return [section.gradeId];
    }
    const classroom = await this.validation.findClassroom(
      target.classroomId!,
      schoolId,
    );
    if (!classroom)
      throw new ValidationDomainException('Target classroom is unavailable');
    return [classroom.section.gradeId];
  }
}

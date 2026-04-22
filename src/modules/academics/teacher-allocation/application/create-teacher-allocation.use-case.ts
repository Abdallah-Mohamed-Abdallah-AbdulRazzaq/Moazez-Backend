import { ConflictException, Injectable } from '@nestjs/common';
import { MembershipStatus, UserType } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { CreateTeacherAllocationDto } from '../dto/teacher-allocation.dto';
import { TeacherAllocationResponseDto } from '../dto/teacher-allocation-response.dto';
import {
  isUniqueConstraintError,
  TeacherAllocationConflictException,
} from '../domain/teacher-allocation.exceptions';
import { TeacherAllocationRepository } from '../infrastructure/teacher-allocation.repository';
import { presentTeacherAllocation } from '../presenters/teacher-allocation.presenter';

@Injectable()
export class CreateTeacherAllocationUseCase {
  constructor(
    private readonly teacherAllocationRepository: TeacherAllocationRepository,
  ) {}

  async execute(
    command: CreateTeacherAllocationDto,
  ): Promise<TeacherAllocationResponseDto> {
    const scope = requireAcademicsScope();

    const [teacherMembership, subject, classroom, term] = await Promise.all([
      this.teacherAllocationRepository.findActiveMembershipByUserId(
        command.teacherUserId,
      ),
      this.teacherAllocationRepository.findSubjectById(command.subjectId),
      this.teacherAllocationRepository.findClassroomById(command.classroomId),
      this.teacherAllocationRepository.findTermById(command.termId),
    ]);

    if (!teacherMembership) {
      throw new NotFoundDomainException('Teacher user not found', {
        teacherUserId: command.teacherUserId,
      });
    }

    if (
      teacherMembership.status !== MembershipStatus.ACTIVE ||
      teacherMembership.userType !== UserType.TEACHER ||
      teacherMembership.user.userType !== UserType.TEACHER
    ) {
      throw new ValidationDomainException('User is not an active teacher', {
        teacherUserId: command.teacherUserId,
      });
    }

    if (!subject) {
      throw new NotFoundDomainException('Subject not found', {
        subjectId: command.subjectId,
      });
    }

    if (!classroom) {
      throw new NotFoundDomainException('Classroom not found', {
        classroomId: command.classroomId,
      });
    }

    if (!term) {
      throw new NotFoundDomainException('Term not found', {
        termId: command.termId,
      });
    }

    if (!term.isActive) {
      throw new ConflictException('Term is closed for allocation changes');
    }

    try {
      const allocation = await this.teacherAllocationRepository.createAllocation({
        schoolId: scope.schoolId,
        teacherUserId: command.teacherUserId,
        subjectId: command.subjectId,
        classroomId: command.classroomId,
        termId: command.termId,
      });

      return presentTeacherAllocation(allocation);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new TeacherAllocationConflictException();
      }

      throw error;
    }
  }
}

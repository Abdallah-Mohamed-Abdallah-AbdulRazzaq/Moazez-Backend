import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { ListSubjectAllocationsQueryDto } from '../dto/subject-allocation.dto';
import { SubjectAllocationsListResponseDto } from '../dto/subject-allocation-response.dto';
import { SubjectAllocationInvalidScopeException } from '../domain/subject-allocation.exceptions';
import { SubjectAllocationRepository } from '../infrastructure/subject-allocation.repository';
import { presentSubjectAllocations } from '../presenters/subject-allocation.presenter';

@Injectable()
export class ListSubjectAllocationsUseCase {
  constructor(
    private readonly subjectAllocationRepository: SubjectAllocationRepository,
  ) {}

  async execute(
    query: ListSubjectAllocationsQueryDto,
  ): Promise<SubjectAllocationsListResponseDto> {
    requireAcademicsScope();

    const term = await this.subjectAllocationRepository.findTermById(query.termId);
    if (!term) {
      throw new SubjectAllocationInvalidScopeException({
        termId: query.termId,
      });
    }

    if (query.gradeId) {
      const grades = await this.subjectAllocationRepository.findGradesByIds([
        query.gradeId,
      ]);
      if (grades.length !== 1) {
        throw new SubjectAllocationInvalidScopeException({
          gradeId: query.gradeId,
        });
      }
    }

    if (query.subjectId) {
      const subjects = await this.subjectAllocationRepository.findSubjectsByIds([
        query.subjectId,
      ]);
      if (subjects.length !== 1) {
        throw new SubjectAllocationInvalidScopeException({
          subjectId: query.subjectId,
        });
      }
    }

    const allocations = await this.subjectAllocationRepository.listAllocations({
      termId: query.termId,
      gradeId: query.gradeId,
      subjectId: query.subjectId,
    });

    return presentSubjectAllocations(allocations);
  }
}

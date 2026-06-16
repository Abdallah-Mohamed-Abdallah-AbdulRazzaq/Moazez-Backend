import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { BulkSaveSubjectAllocationsDto } from '../dto/subject-allocation.dto';
import { SubjectAllocationsBulkResponseDto } from '../dto/subject-allocation-response.dto';
import {
  isUniqueConstraintError,
  SubjectAllocationClosedTermException,
  SubjectAllocationDuplicatePairException,
  SubjectAllocationInvalidBulkSizeException,
  SubjectAllocationInvalidScopeException,
  SubjectAllocationInvalidWeeklyHoursException,
} from '../domain/subject-allocation.exceptions';
import { SubjectAllocationRepository } from '../infrastructure/subject-allocation.repository';
import { presentSubjectAllocations } from '../presenters/subject-allocation.presenter';

const MAX_BULK_ITEMS = 500;
const MAX_WEEKLY_HOURS = 80;

@Injectable()
export class BulkSaveSubjectAllocationsUseCase {
  constructor(
    private readonly subjectAllocationRepository: SubjectAllocationRepository,
  ) {}

  async execute(
    command: BulkSaveSubjectAllocationsDto,
  ): Promise<SubjectAllocationsBulkResponseDto> {
    const scope = requireAcademicsScope();
    assertValidBulkItems(command.items);

    const term = await this.subjectAllocationRepository.findTermById(
      command.termId,
    );
    if (!term) {
      throw new SubjectAllocationInvalidScopeException({
        termId: command.termId,
      });
    }
    if (!term.isActive) {
      throw new SubjectAllocationClosedTermException({
        termId: command.termId,
      });
    }

    const gradeIds = unique(command.items.map((item) => item.gradeId));
    const subjectIds = unique(command.items.map((item) => item.subjectId));
    const [grades, subjects] = await Promise.all([
      this.subjectAllocationRepository.findGradesByIds(gradeIds),
      this.subjectAllocationRepository.findSubjectsByIds(subjectIds),
    ]);

    const validGradeIds = new Set(grades.map((grade) => grade.id));
    for (const gradeId of gradeIds) {
      if (!validGradeIds.has(gradeId)) {
        throw new SubjectAllocationInvalidScopeException({ gradeId });
      }
    }

    const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
    for (const subjectId of subjectIds) {
      const subject = subjectById.get(subjectId);
      if (!subject) {
        throw new SubjectAllocationInvalidScopeException({ subjectId });
      }
      if (!subject.isActive) {
        throw new SubjectAllocationInvalidScopeException({
          subjectId,
          reason: 'subject_inactive',
        });
      }
    }

    try {
      const allocations =
        await this.subjectAllocationRepository.bulkSaveAllocations({
          schoolId: scope.schoolId,
          academicYearId: term.academicYearId,
          termId: term.id,
          items: command.items.map((item) => ({
            gradeId: item.gradeId,
            subjectId: item.subjectId,
            weeklyHours: item.weeklyHours,
          })),
        });

      return presentSubjectAllocations(allocations);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new SubjectAllocationDuplicatePairException({
          termId: term.id,
        });
      }

      throw error;
    }
  }
}

function assertValidBulkItems(
  items: BulkSaveSubjectAllocationsDto['items'],
): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw new SubjectAllocationInvalidBulkSizeException({
      minItems: 1,
      maxItems: MAX_BULK_ITEMS,
    });
  }
  if (items.length > MAX_BULK_ITEMS) {
    throw new SubjectAllocationInvalidBulkSizeException({
      minItems: 1,
      maxItems: MAX_BULK_ITEMS,
      received: items.length,
    });
  }

  const seenPairs = new Set<string>();
  for (const item of items) {
    if (
      !Number.isInteger(item.weeklyHours) ||
      item.weeklyHours < 0 ||
      item.weeklyHours > MAX_WEEKLY_HOURS
    ) {
      throw new SubjectAllocationInvalidWeeklyHoursException({
        gradeId: item.gradeId,
        subjectId: item.subjectId,
        min: 0,
        max: MAX_WEEKLY_HOURS,
        received: item.weeklyHours,
      });
    }

    const pairKey = `${item.gradeId}:${item.subjectId}`;
    if (seenPairs.has(pairKey)) {
      throw new SubjectAllocationDuplicatePairException({
        gradeId: item.gradeId,
        subjectId: item.subjectId,
      });
    }
    seenPairs.add(pairKey);
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

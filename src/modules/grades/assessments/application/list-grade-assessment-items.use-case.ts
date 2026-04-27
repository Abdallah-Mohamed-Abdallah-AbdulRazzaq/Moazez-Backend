import { Injectable } from '@nestjs/common';
import { GradeItemStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { normalizeGradeItemStatus } from '../../shared/domain/grade-item-validation';
import { ListGradeAssessmentItemsQueryDto } from '../dto/grade-assessment-items.dto';
import {
  GradesAssessmentItemsRepository,
  ListAssessmentItemsFilters,
} from '../infrastructure/grades-assessment-items.repository';
import {
  buildVirtualMissingGradeItem,
  presentGradeItems,
} from '../presenters/grade-item.presenter';

@Injectable()
export class ListGradeAssessmentItemsUseCase {
  constructor(
    private readonly gradeItemsRepository: GradesAssessmentItemsRepository,
  ) {}

  async execute(assessmentId: string, query: ListGradeAssessmentItemsQueryDto) {
    const assessment =
      await this.gradeItemsRepository.findAssessmentForItems(assessmentId);

    if (!assessment) {
      throw new NotFoundDomainException('Grade assessment not found', {
        assessmentId,
      });
    }

    const filters = this.normalizeFilters(query);
    const persistedItems = await this.gradeItemsRepository.listAssessmentItems({
      assessmentId: assessment.id,
      filters,
    });

    const includeMissingStudents = query.includeMissingStudents ?? true;
    if (
      !includeMissingStudents ||
      (filters.status && filters.status !== GradeItemStatus.MISSING)
    ) {
      return presentGradeItems(persistedItems);
    }

    const existingItemsForVirtualCheck =
      filters.status === GradeItemStatus.MISSING
        ? await this.gradeItemsRepository.listAssessmentItems({
            assessmentId: assessment.id,
            filters: { ...filters, status: undefined },
          })
        : persistedItems;
    const roster =
      await this.gradeItemsRepository.listStudentsInAssessmentScope({
        assessment,
        filters,
      });
    const existingStudentIds = new Set(
      existingItemsForVirtualCheck.map((item) => item.studentId),
    );
    const virtualMissingItems = roster
      .filter((enrollment) => !existingStudentIds.has(enrollment.studentId))
      .map((enrollment) =>
        buildVirtualMissingGradeItem({ assessment, enrollment }),
      );

    return presentGradeItems([...persistedItems, ...virtualMissingItems]);
  }

  private normalizeFilters(
    query: ListGradeAssessmentItemsQueryDto,
  ): ListAssessmentItemsFilters {
    return {
      ...(query.classroomId ? { classroomId: query.classroomId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.gradeId ? { gradeId: query.gradeId } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.status
        ? { status: normalizeGradeItemStatus(query.status) }
        : {}),
    };
  }
}

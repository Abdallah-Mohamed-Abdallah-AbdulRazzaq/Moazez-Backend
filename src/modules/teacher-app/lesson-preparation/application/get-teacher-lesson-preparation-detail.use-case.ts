import { Injectable } from '@nestjs/common';
import { LessonPlanStatus, CurriculumStatus } from '@prisma/client';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherLessonPreparationItemDto } from '../dto/teacher-lesson-preparation-response.dto';
import { TeacherLessonPreparationNotFoundException } from '../domain/teacher-lesson-preparation.errors';
import { TeacherLessonPreparationReadAdapter } from '../infrastructure/teacher-lesson-preparation-read.adapter';
import { TeacherLessonPreparationPresenter } from '../presenters/teacher-lesson-preparation.presenter';

@Injectable()
export class GetTeacherLessonPreparationDetailUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly readAdapter: TeacherLessonPreparationReadAdapter,
  ) {}

  async execute(lessonPlanItemId: string): Promise<TeacherLessonPreparationItemDto> {
    const teacherContext = this.accessService.assertCurrentTeacher();
    const allocationIds =
      await this.accessService.listOwnedTeacherAllocationIds();
    const item = await this.readAdapter.findOwnedItemById({
      teacherUserId: teacherContext.teacherUserId,
      schoolId: teacherContext.schoolId,
      allocationIds,
      itemId: lessonPlanItemId,
      includeArchivedPlan: true,
    });

    if (!item || !isReadable(item)) {
      throw new TeacherLessonPreparationNotFoundException({
        lessonPlanItemId,
      });
    }

    return TeacherLessonPreparationPresenter.presentItem(item);
  }
}

function isReadable(item: {
  lessonPlan: { status: LessonPlanStatus; deletedAt: Date | null };
  curriculum: { status: CurriculumStatus; deletedAt: Date | null };
  unit: { deletedAt: Date | null };
  lesson: { deletedAt: Date | null };
}): boolean {
  return (
    !item.lessonPlan.deletedAt &&
    item.lessonPlan.status !== LessonPlanStatus.ARCHIVED &&
    !item.curriculum.deletedAt &&
    item.curriculum.status !== CurriculumStatus.ARCHIVED &&
    !item.unit.deletedAt &&
    !item.lesson.deletedAt
  );
}

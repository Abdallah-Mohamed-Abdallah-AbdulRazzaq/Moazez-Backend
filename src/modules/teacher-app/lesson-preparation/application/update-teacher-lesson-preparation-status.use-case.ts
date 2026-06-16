import { Injectable } from '@nestjs/common';
import { CurriculumStatus, LessonPlanStatus } from '@prisma/client';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { UpdateTeacherLessonPreparationStatusDto } from '../dto/teacher-lesson-preparation.dto';
import { TeacherLessonPreparationItemDto } from '../dto/teacher-lesson-preparation-response.dto';
import {
  TeacherLessonPreparationClosedTermException,
  TeacherLessonPreparationNotFoundException,
  TeacherLessonPreparationReadOnlyException,
} from '../domain/teacher-lesson-preparation.errors';
import {
  assertTeacherLessonPreparationTransition,
  mapTeacherLessonPreparationStatus,
} from '../domain/teacher-lesson-preparation-status';
import { TeacherLessonPreparationReadAdapter } from '../infrastructure/teacher-lesson-preparation-read.adapter';
import { TeacherLessonPreparationPresenter } from '../presenters/teacher-lesson-preparation.presenter';

@Injectable()
export class UpdateTeacherLessonPreparationStatusUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly readAdapter: TeacherLessonPreparationReadAdapter,
  ) {}

  async execute(
    lessonPlanItemId: string,
    command: UpdateTeacherLessonPreparationStatusDto,
  ): Promise<TeacherLessonPreparationItemDto> {
    const teacherContext = this.accessService.assertCurrentTeacher();
    const allocationIds =
      await this.accessService.listOwnedTeacherAllocationIds();
    const existing = await this.readAdapter.findOwnedItemById({
      teacherUserId: teacherContext.teacherUserId,
      schoolId: teacherContext.schoolId,
      allocationIds,
      itemId: lessonPlanItemId,
      includeArchivedPlan: true,
    });

    if (!existing) {
      throw new TeacherLessonPreparationNotFoundException({
        lessonPlanItemId,
      });
    }

    if (!existing.lessonPlan.term.isActive) {
      throw new TeacherLessonPreparationClosedTermException({
        lessonPlanItemId,
        termId: existing.lessonPlan.termId,
      });
    }

    assertItemWritable(existing, lessonPlanItemId);

    const targetStatus = mapTeacherLessonPreparationStatus(command.status);
    assertTeacherLessonPreparationTransition({
      current: existing.status,
      target: targetStatus,
    });

    const updated = await this.readAdapter.updateItemStatus({
      itemId: lessonPlanItemId,
      status: targetStatus,
      notes: command.notes,
      updatedByUserId: teacherContext.teacherUserId,
    });

    return TeacherLessonPreparationPresenter.presentItem(updated);
  }
}

function assertItemWritable(
  item: {
    lessonPlan: { status: LessonPlanStatus; deletedAt: Date | null };
    curriculum: { status: CurriculumStatus; deletedAt: Date | null };
    unit: { deletedAt: Date | null };
    lesson: { deletedAt: Date | null };
  },
  lessonPlanItemId: string,
): void {
  if (item.lessonPlan.deletedAt || item.unit.deletedAt || item.lesson.deletedAt) {
    throw new TeacherLessonPreparationNotFoundException({ lessonPlanItemId });
  }

  if (
    item.lessonPlan.status === LessonPlanStatus.ARCHIVED ||
    item.curriculum.status === CurriculumStatus.ARCHIVED
  ) {
    throw new TeacherLessonPreparationReadOnlyException({ lessonPlanItemId });
  }

  if (item.curriculum.deletedAt) {
    throw new TeacherLessonPreparationNotFoundException({ lessonPlanItemId });
  }
}

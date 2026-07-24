import { Injectable } from '@nestjs/common';
import { LessonContentPlaybackNotFoundException } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.errors';
import type { LessonContentPlaybackResponseDto } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback-response.dto';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentAppChildNotFoundException,
  ParentAppEnrollmentNotFoundException,
  ParentAppGuardianNotFoundException,
} from '../../shared/parent-app-errors';
import { ParentChildLessonsReadAdapter } from '../infrastructure/parent-child-lessons-read.adapter';

@Injectable()
export class GetParentChildLessonPlaybackUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly lessonsReadAdapter: ParentChildLessonsReadAdapter,
  ) {}

  async execute(params: {
    studentId: string;
    lessonPlanItemId: string;
    contentItemId: string;
  }): Promise<LessonContentPlaybackResponseDto> {
    try {
      const context = await this.accessService.getParentAppContext();
      const child = context.children.find(
        (candidate) => candidate.studentId === params.studentId,
      );
      if (!child) throw new LessonContentPlaybackNotFoundException();

      const response = await this.lessonsReadAdapter.getLessonContentPlayback({
        context,
        child,
        lessonPlanItemId: params.lessonPlanItemId,
        contentItemId: params.contentItemId,
      });
      if (!response) throw new LessonContentPlaybackNotFoundException();
      return response;
    } catch (error) {
      if (
        error instanceof ParentAppGuardianNotFoundException ||
        error instanceof ParentAppChildNotFoundException ||
        error instanceof ParentAppEnrollmentNotFoundException
      ) {
        throw new LessonContentPlaybackNotFoundException();
      }
      throw error;
    }
  }
}

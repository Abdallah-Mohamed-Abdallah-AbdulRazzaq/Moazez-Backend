import { Injectable } from '@nestjs/common';
import { LessonContentPlaybackNotFoundException } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.errors';
import type { LessonContentPlaybackResponseDto } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback-response.dto';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherLessonPreparationReadAdapter } from '../infrastructure/teacher-lesson-preparation-read.adapter';

@Injectable()
export class GetTeacherLessonPlaybackUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly lessonPreparationReadAdapter: TeacherLessonPreparationReadAdapter,
  ) {}

  async execute(params: {
    lessonPlanItemId: string;
    contentItemId: string;
  }): Promise<LessonContentPlaybackResponseDto> {
    const context = this.accessService.getTeacherAppContext();
    const response =
      await this.lessonPreparationReadAdapter.getLessonContentPlayback({
        context,
        lessonPlanItemId: params.lessonPlanItemId,
        contentItemId: params.contentItemId,
      });
    if (!response) throw new LessonContentPlaybackNotFoundException();
    return response;
  }
}

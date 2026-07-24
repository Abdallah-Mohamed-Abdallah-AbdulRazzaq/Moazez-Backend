import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentLessonPlaybackNotFoundException } from '../domain/student-lesson-playback.errors';
import { StudentLessonPlaybackResponseDto } from '../dto/student-lesson-playback-response.dto';
import { StudentLessonsReadAdapter } from '../infrastructure/student-lessons-read.adapter';

@Injectable()
export class GetStudentLessonPlaybackUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly lessonsReadAdapter: StudentLessonsReadAdapter,
  ) {}

  async execute(params: {
    lessonPlanItemId: string;
    contentItemId: string;
  }): Promise<StudentLessonPlaybackResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const response = await this.lessonsReadAdapter.getLessonContentPlayback({
      context,
      lessonPlanItemId: params.lessonPlanItemId,
      contentItemId: params.contentItemId,
    });

    if (!response) {
      throw new StudentLessonPlaybackNotFoundException();
    }

    return response;
  }
}

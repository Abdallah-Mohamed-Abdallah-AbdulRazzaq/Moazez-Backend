import { Injectable } from '@nestjs/common';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentLessonPlaybackNotFoundException } from '../domain/student-lesson-playback.errors';
import { StudentLessonPlaybackResponseDto } from '../dto/student-lesson-playback-response.dto';
import { StudentLessonsReadAdapter } from '../infrastructure/student-lessons-read.adapter';
import { StudentLessonPlaybackPresenter } from '../presenters/student-lesson-playback.presenter';

const STUDENT_PLAYBACK_TTL_SECONDS = 300;

@Injectable()
export class GetStudentLessonPlaybackUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly lessonsReadAdapter: StudentLessonsReadAdapter,
    private readonly storageService: StorageService,
  ) {}

  async execute(params: {
    lessonPlanItemId: string;
    contentItemId: string;
  }): Promise<StudentLessonPlaybackResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const response = await this.lessonsReadAdapter.withPlayableLessonContent(
      {
        context,
        lessonPlanItemId: params.lessonPlanItemId,
        contentItemId: params.contentItemId,
      },
      async (playable) => {
        const capability = await this.storageService.createDownloadUrl({
          bucket: playable.bucket,
          objectKey: playable.objectKey,
          expiresInSeconds: STUDENT_PLAYBACK_TTL_SECONDS,
          disposition: 'inline',
          contentType: playable.mimeType,
        });

        return StudentLessonPlaybackPresenter.present({
          url: capability.url,
          expiresAt: capability.expiresAt,
          mimeType: playable.mimeType,
          sizeBytes: playable.sizeBytes,
        });
      },
    );

    if (!response) {
      throw new StudentLessonPlaybackNotFoundException();
    }

    return response;
  }
}

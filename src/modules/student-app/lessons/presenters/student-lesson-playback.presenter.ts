import { LessonContentPlaybackPresenter } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.presenter';
import type { StudentLessonPlaybackResponseDto } from '../dto/student-lesson-playback-response.dto';

export type StudentLessonPlaybackPresenterInput = {
  url: string;
  expiresAt: Date;
  mimeType: 'video/mp4' | 'video/webm';
  sizeBytes: bigint;
};

export class StudentLessonPlaybackPresenter {
  static present(
    input: StudentLessonPlaybackPresenterInput,
  ): StudentLessonPlaybackResponseDto {
    return LessonContentPlaybackPresenter.present(input);
  }
}

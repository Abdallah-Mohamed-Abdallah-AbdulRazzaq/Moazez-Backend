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
    return {
      url: input.url,
      expiresAt: input.expiresAt.toISOString(),
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes.toString(10),
      disposition: 'inline',
      renewable: true,
    };
  }
}

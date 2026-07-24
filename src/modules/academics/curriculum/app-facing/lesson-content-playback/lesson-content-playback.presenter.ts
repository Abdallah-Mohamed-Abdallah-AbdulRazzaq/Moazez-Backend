import type { LessonContentPlaybackResponseDto } from './lesson-content-playback-response.dto';
import type { PlayableVideoMimeType } from './lesson-content-playback.types';

export type LessonContentPlaybackPresenterInput = {
  url: string;
  expiresAt: Date;
  mimeType: PlayableVideoMimeType;
  sizeBytes: bigint;
};

export class LessonContentPlaybackPresenter {
  static present(
    input: LessonContentPlaybackPresenterInput,
  ): LessonContentPlaybackResponseDto {
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

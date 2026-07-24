import { ApiProperty } from '@nestjs/swagger';
import type { PlayableVideoMimeType } from './lesson-content-playback.types';

export class LessonContentPlaybackResponseDto {
  @ApiProperty()
  url!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ enum: ['video/mp4', 'video/webm'] })
  mimeType!: PlayableVideoMimeType;

  @ApiProperty({
    description: 'Decimal byte count represented as a string.',
    example: '209715200',
  })
  sizeBytes!: string;

  @ApiProperty({ enum: ['inline'] })
  disposition!: 'inline';

  @ApiProperty({ enum: [true] })
  renewable!: true;
}

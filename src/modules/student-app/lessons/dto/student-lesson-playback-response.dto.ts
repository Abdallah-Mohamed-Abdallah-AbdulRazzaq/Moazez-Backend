import { ApiProperty } from '@nestjs/swagger';

export class StudentLessonPlaybackResponseDto {
  @ApiProperty()
  url!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ enum: ['video/mp4', 'video/webm'] })
  mimeType!: 'video/mp4' | 'video/webm';

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

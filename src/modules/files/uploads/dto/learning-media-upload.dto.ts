import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class CreateLearningMediaUploadDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientRequestId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  originalName!: string;

  @ApiProperty({
    enum: [
      'application/pdf',
      'text/plain',
      'image/jpeg',
      'image/png',
      'audio/mpeg',
      'audio/mp4',
      'audio/webm',
      'video/mp4',
      'video/webm',
    ],
  })
  @IsString()
  @IsIn([
    'application/pdf',
    'text/plain',
    'image/jpeg',
    'image/png',
    'audio/mpeg',
    'audio/mp4',
    'audio/webm',
    'video/mp4',
    'video/webm',
  ])
  expectedMimeType!: string;

  @ApiProperty({ example: '1048576', type: String })
  @IsString()
  @Matches(/^[1-9]\d*$/u)
  expectedSizeBytes!: string;
}

export class LearningMediaUploadIntentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiPropertyOptional()
  uploadUrl?: string;

  @ApiPropertyOptional()
  uploadUrlExpiresAt?: string;

  @ApiPropertyOptional()
  retryable?: boolean;

  @ApiPropertyOptional()
  reasonCode?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  fileId?: string;

  @ApiPropertyOptional()
  mimeType?: string;

  @ApiPropertyOptional({ type: String })
  sizeBytes?: string;

  @ApiPropertyOptional({ nullable: true })
  durationSeconds?: number | null;

  @ApiPropertyOptional({ nullable: true })
  width?: number | null;

  @ApiPropertyOptional({ nullable: true })
  height?: number | null;
}

export class LearningMediaUploadCompletionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty({ type: String })
  sizeBytes!: string;

  @ApiProperty({ nullable: true })
  durationSeconds!: number | null;

  @ApiProperty({ nullable: true })
  width!: number | null;

  @ApiProperty({ nullable: true })
  height!: number | null;
}

export class CompleteLearningMediaUploadDto {}

export class LearningMediaUploadCancelResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  status!: string;
}

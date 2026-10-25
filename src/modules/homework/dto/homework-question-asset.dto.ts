import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AssessmentAssetCategory,
  AssessmentAssetSourceType,
} from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateHomeworkQuestionAssetDto {
  @ApiProperty({ enum: AssessmentAssetSourceType })
  @IsEnum(AssessmentAssetSourceType)
  sourceType!: AssessmentAssetSourceType;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required for MANAGED_FILE; authoritative READY upload session',
  })
  @ValidateIf(
    (value: CreateHomeworkQuestionAssetDto) =>
      value.sourceType === 'MANAGED_FILE',
  )
  @IsUUID()
  uploadId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for MANAGED_FILE; must match the upload session',
  })
  @ValidateIf(
    (value: CreateHomeworkQuestionAssetDto) =>
      value.sourceType === 'MANAGED_FILE',
  )
  @IsUUID()
  fileId?: string;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Required only for EXTERNAL_HTTPS',
  })
  @ValidateIf(
    (value: CreateHomeworkQuestionAssetDto) =>
      value.sourceType === 'EXTERNAL_HTTPS',
  )
  @IsString()
  @MaxLength(2000)
  externalUrl?: string;

  @ApiPropertyOptional({
    enum: AssessmentAssetCategory,
    description: 'Managed classification must match verified MIME',
  })
  @IsOptional()
  @IsEnum(AssessmentAssetCategory)
  category?: AssessmentAssetCategory;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 2147483647, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder?: number;
}

export class UpdateHomeworkQuestionAssetDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ enum: AssessmentAssetCategory })
  @IsOptional()
  @IsEnum(AssessmentAssetCategory)
  category?: AssessmentAssetCategory;
}

export class ReorderHomeworkQuestionAssetDto {
  @ApiProperty({ minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder!: number;
}

export class HomeworkQuestionAssetFileDto {
  @ApiProperty() filename!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty({ type: String }) sizeBytes!: string;
}
export class HomeworkQuestionAssetAccessDto {
  @ApiProperty({ type: String, nullable: true }) previewPath!: string | null;
  @ApiProperty({ type: String, nullable: true }) downloadPath!: string | null;
}
export class HomeworkQuestionAssetDto {
  @ApiProperty({ format: 'uuid' }) assetId!: string;
  @ApiProperty({ format: 'uuid' }) questionId!: string;
  @ApiProperty({ enum: AssessmentAssetSourceType })
  sourceType!: AssessmentAssetSourceType;
  @ApiProperty({ enum: AssessmentAssetCategory })
  category!: AssessmentAssetCategory;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: () => HomeworkQuestionAssetFileDto, nullable: true })
  file!: HomeworkQuestionAssetFileDto | null;
  @ApiProperty({ type: String, nullable: true }) externalUrl!: string | null;
  @ApiProperty({ type: () => HomeworkQuestionAssetAccessDto, nullable: true })
  access!: HomeworkQuestionAssetAccessDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
export class HomeworkQuestionAssetsResponseDto {
  @ApiProperty({ format: 'uuid' }) questionId!: string;
  @ApiProperty({ type: () => [HomeworkQuestionAssetDto] })
  assets!: HomeworkQuestionAssetDto[];
}
export class HomeworkQuestionAssetResponseDto {
  @ApiProperty({ type: () => HomeworkQuestionAssetDto })
  asset!: HomeworkQuestionAssetDto;
}

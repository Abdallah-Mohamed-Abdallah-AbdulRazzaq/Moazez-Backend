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

export class CreateQuestionGroupAssetDto {
  @ApiProperty({ enum: AssessmentAssetSourceType })
  @IsEnum(AssessmentAssetSourceType)
  sourceType!: AssessmentAssetSourceType;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required for MANAGED_FILE; authoritative READY upload session',
  })
  @ValidateIf(
    (value: CreateQuestionGroupAssetDto) => value.sourceType === 'MANAGED_FILE',
  )
  @IsUUID()
  uploadId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for MANAGED_FILE; must match the upload session',
  })
  @ValidateIf(
    (value: CreateQuestionGroupAssetDto) => value.sourceType === 'MANAGED_FILE',
  )
  @IsUUID()
  fileId?: string;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Required only for EXTERNAL_HTTPS',
  })
  @ValidateIf(
    (value: CreateQuestionGroupAssetDto) =>
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

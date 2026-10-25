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

export class CreateGradeAssetDto {
  @ApiProperty({ enum: AssessmentAssetSourceType })
  @IsEnum(AssessmentAssetSourceType)
  sourceType!: AssessmentAssetSourceType;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required for MANAGED_FILE; authoritative READY upload session',
  })
  @ValidateIf(
    (value: CreateGradeAssetDto) => value.sourceType === 'MANAGED_FILE',
  )
  @IsUUID()
  uploadId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for MANAGED_FILE; must match the upload session',
  })
  @ValidateIf(
    (value: CreateGradeAssetDto) => value.sourceType === 'MANAGED_FILE',
  )
  @IsUUID()
  fileId?: string;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Required only for EXTERNAL_HTTPS',
  })
  @ValidateIf(
    (value: CreateGradeAssetDto) => value.sourceType === 'EXTERNAL_HTTPS',
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

export class UpdateGradeAssetDto {
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

export class ReorderGradeAssetDto {
  @ApiProperty({ minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder!: number;
}

export class GradeAssetFileDto {
  @ApiProperty() filename!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty({ type: String }) sizeBytes!: string;
}
export class GradeAssetAccessDto {
  @ApiProperty({ type: String, nullable: true }) previewPath!: string | null;
  @ApiProperty({ type: String, nullable: true }) downloadPath!: string | null;
}
export class GradeAssetDto {
  @ApiProperty({ format: 'uuid' }) assetId!: string;
  @ApiProperty({ format: 'uuid' }) assessmentId!: string;
  @ApiPropertyOptional({ format: 'uuid' }) questionId?: string;
  @ApiProperty({ enum: AssessmentAssetSourceType })
  sourceType!: AssessmentAssetSourceType;
  @ApiProperty({ enum: AssessmentAssetCategory })
  category!: AssessmentAssetCategory;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: () => GradeAssetFileDto, nullable: true })
  file!: GradeAssetFileDto | null;
  @ApiProperty({ type: String, nullable: true }) externalUrl!: string | null;
  @ApiProperty({ type: () => GradeAssetAccessDto, nullable: true })
  access!: GradeAssetAccessDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
export class GradeAssetsResponseDto {
  @ApiProperty({ format: 'uuid' }) assessmentId!: string;
  @ApiPropertyOptional({ format: 'uuid' }) questionId?: string;
  @ApiProperty({ type: () => [GradeAssetDto] })
  assets!: GradeAssetDto[];
}
export class GradeAssetResponseDto {
  @ApiProperty({ type: () => GradeAssetDto })
  asset!: GradeAssetDto;
}

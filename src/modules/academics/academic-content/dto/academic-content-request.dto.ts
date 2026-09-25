import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AcademicContentAudienceType,
  AcademicContentTargetScopeType,
  AcademicContentType,
} from '@prisma/client';

export class CreateAcademicContentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  academicYearId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  termId!: string;

  @ApiProperty({ enum: AcademicContentType })
  @IsEnum(AcademicContentType)
  type!: AcademicContentType;

  @ApiProperty({ enum: AcademicContentAudienceType })
  @IsEnum(AcademicContentAudienceType)
  audience!: AcademicContentAudienceType;

  @ApiProperty({ maxLength: 180 })
  @IsString()
  @MaxLength(180)
  title!: string;

  @ApiPropertyOptional({ maxLength: 4000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;
}

export class UpdateAcademicContentDto {
  @ApiPropertyOptional({ maxLength: 180 })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @ApiPropertyOptional({ maxLength: 4000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ enum: AcademicContentAudienceType })
  @IsOptional()
  @IsEnum(AcademicContentAudienceType)
  audience?: AcademicContentAudienceType;
}

export class ListAcademicContentQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AcademicContentTargetDto {
  @ApiProperty({ enum: AcademicContentTargetScopeType })
  @IsEnum(AcademicContentTargetScopeType)
  scopeType!: AcademicContentTargetScopeType;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  stageId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  gradeId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  sectionId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  classroomId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  teacherSubjectAllocationId?: string | null;
}

export class ReplaceAcademicContentTargetsDto {
  @ApiProperty({ type: () => AcademicContentTargetDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcademicContentTargetDto)
  targets!: AcademicContentTargetDto[];
}

export class CreateAcademicContentUploadDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientRequestId!: string;

  @ApiProperty()
  @IsString()
  originalName!: string;

  @ApiProperty()
  @IsString()
  expectedMimeType!: string;

  @ApiProperty({ type: String, description: 'Positive decimal bytes' })
  @IsString()
  @MaxLength(11)
  @Matches(/^[1-9][0-9]*$/u)
  expectedSizeBytes!: string;
}

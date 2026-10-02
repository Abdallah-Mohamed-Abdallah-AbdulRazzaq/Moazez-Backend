import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListAcademicContentPreparationTemplatesQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateAcademicContentPreparationTemplateDto {
  @ApiProperty({ maxLength: 180 })
  @IsString()
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  stageId?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  topic?: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  objectives?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  learningOutcomes?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  teachingStrategies?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  activities?: string[];

  @ApiPropertyOptional({ nullable: true, maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resourceNotes?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  assessmentNotes?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  teacherNotes?: string | null;
}

export class UpdateAcademicContentPreparationTemplateDto extends PartialType(
  CreateAcademicContentPreparationTemplateDto,
) {}

export class AcademicContentPreparationTemplateListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) stageId!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) subjectId!: string | null;
  @ApiProperty() objectivesCount!: number;
  @ApiProperty() learningOutcomesCount!: number;
  @ApiProperty() teachingStrategiesCount!: number;
  @ApiProperty() activitiesCount!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class AcademicContentPreparationTemplateListResponseDto {
  @ApiProperty({
    type: () => AcademicContentPreparationTemplateListItemDto,
    isArray: true,
  })
  items!: AcademicContentPreparationTemplateListItemDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}

export class AcademicContentPreparationTemplateDetailDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) stageId!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) subjectId!: string | null;
  @ApiProperty({ nullable: true }) topic!: string | null;
  @ApiProperty({ type: [String] }) objectives!: string[];
  @ApiProperty({ type: [String] }) learningOutcomes!: string[];
  @ApiProperty({ type: [String] }) teachingStrategies!: string[];
  @ApiProperty({ type: [String] }) activities!: string[];
  @ApiProperty({ nullable: true }) resourceNotes!: string | null;
  @ApiProperty({ nullable: true }) assessmentNotes!: string | null;
  @ApiProperty({ nullable: true }) teacherNotes!: string | null;
  @ApiProperty({ format: 'uuid' }) createdByUserId!: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) updatedByUserId!:
    | string
    | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class AcademicContentPreparationTemplateDeleteResponseDto {
  @ApiProperty() ok!: boolean;
}

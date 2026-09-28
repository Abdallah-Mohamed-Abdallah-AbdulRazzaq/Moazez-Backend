import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
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
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
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
  topic?: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectives?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learningOutcomes?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  teachingStrategies?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activities?: string[];

  @ApiPropertyOptional({ nullable: true, maxLength: 4000 })
  @IsOptional()
  @IsString()
  resourceNotes?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 4000 })
  @IsOptional()
  @IsString()
  assessmentNotes?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 4000 })
  @IsOptional()
  @IsString()
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

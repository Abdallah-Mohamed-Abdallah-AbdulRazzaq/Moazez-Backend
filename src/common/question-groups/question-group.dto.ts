import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreateQuestionGroupDto {
  @ApiProperty({ example: 'Read the passage and answer', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string | null;
  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description:
      'Closed ST08 RichQuestionContent V1; asset references must belong to this group.',
  })
  @Allow()
  sharedStimulus?: unknown;
  @ApiPropertyOptional({ minimum: 0, maximum: 2147483647 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  layoutOrder?: number;
}
export class UpdateQuestionGroupDto extends PartialType(
  CreateQuestionGroupDto,
) {}
export class QuestionGroupMembershipDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() questionId!: string;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Explicit current membership; stale moves conflict.',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  expectedGroupId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  groupId!: string | null;
  @ApiProperty({ minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  layoutOrder!: number;
}
export class QuestionGroupBlockOrderDto {
  @ApiProperty({ enum: ['question', 'group'] })
  @IsIn(['question', 'group'])
  kind!: 'question' | 'group';
  @ApiProperty({ format: 'uuid' }) @IsUUID() id!: string;
  @ApiProperty({ minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  layoutOrder!: number;
}
export class ChangeQuestionGroupLayoutDto {
  @ApiProperty({
    type: [QuestionGroupMembershipDto],
    maxItems: 200,
    description:
      'Homework cap 100; Grades cap 200. Existing flat question sortOrder never changes.',
  })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuestionGroupMembershipDto)
  questions!: QuestionGroupMembershipDto[];
  @ApiProperty({ type: [QuestionGroupBlockOrderDto], maxItems: 200 })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuestionGroupBlockOrderDto)
  blocks!: QuestionGroupBlockOrderDto[];
}
export class QuestionGroupFileResponseDto {
  @ApiProperty({ example: 'passage.txt' }) filename!: string;
  @ApiProperty({ example: 'text/plain' }) mimeType!: string;
  @ApiProperty({
    example: '4096',
    description: 'Decimal byte count; never a JavaScript bigint.',
  })
  sizeBytes!: string;
}
export class QuestionGroupAssetResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) groupId!: string;
  @ApiProperty({ enum: ['MANAGED_FILE', 'EXTERNAL_HTTPS'] })
  sourceType!: string;
  @ApiProperty({ enum: ['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'OTHER'] })
  category!: string;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ minimum: 0 }) sortOrder!: number;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Validated external HTTPS source only; managed content has no provider URL.',
  })
  externalUrl!: string | null;
  @ApiProperty() available!: boolean;
  @ApiProperty() previewAllowed!: boolean;
  @ApiProperty() downloadAllowed!: boolean;
  @ApiPropertyOptional({ type: QuestionGroupFileResponseDto })
  file?: QuestionGroupFileResponseDto;
}
export class QuestionGroupDisplayResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) instructions!: string | null;
  @ApiProperty({ minimum: 0 }) layoutOrder!: number;
  @ApiProperty({ type: [String], format: 'uuid' }) questionIds!: string[];
  @ApiProperty({
    example: '2.00',
    description: 'Derived active-child points, never an additional score.',
  })
  points!: string;
  @ApiProperty({
    description:
      'False omits invalid or unavailable stimulus without blocking child answer review.',
  })
  sharedStimulusSupported!: boolean;
  @ApiPropertyOptional({
    type: Object,
    description:
      'Validated closed RichQuestionContent V1; absent when unsupported or empty.',
  })
  sharedStimulus?: unknown;
  @ApiProperty({ type: [QuestionGroupAssetResponseDto] })
  assets!: QuestionGroupAssetResponseDto[];
}
export class QuestionGroupDisplayItemResponseDto {
  @ApiProperty({ enum: ['question', 'group'] }) kind!: 'question' | 'group';
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Present only for a flat question block.',
  })
  questionId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Present only for a non-answerable group block.',
  })
  groupId?: string;
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Canonical child IDs in display order for a group block.',
  })
  questionIds?: string[];
}
export class QuestionGroupResponseDto {
  @ApiProperty({ type: [QuestionGroupDisplayResponseDto] })
  groups!: QuestionGroupDisplayResponseDto[];
  @ApiProperty({ type: [QuestionGroupDisplayItemResponseDto] })
  displayItems!: QuestionGroupDisplayItemResponseDto[];
}
export class UpdateQuestionGroupAssetDto {
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
  @ApiPropertyOptional({ minimum: 0, maximum: 2147483647 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder?: number;
}

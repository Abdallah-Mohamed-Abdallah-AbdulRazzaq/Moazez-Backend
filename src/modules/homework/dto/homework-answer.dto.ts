import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class HomeworkAnswerInputDto {
  @IsString()
  questionId!: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(20_000)
  textAnswer?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  selectedOptionIds?: string[] | null;
}

export class SaveHomeworkAnswerDto {
  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(20_000)
  textAnswer?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  selectedOptionIds?: string[] | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isDraft?: boolean;
}

export class BulkSaveHomeworkAnswersDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => HomeworkAnswerInputDto)
  answers!: HomeworkAnswerInputDto[];
}

export class ReviewHomeworkAnswerDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  awardedPoints?: number | null;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(2000)
  teacherComment?: string | null;
}

export class BulkReviewHomeworkAnswerItemDto extends ReviewHomeworkAnswerDto {
  @IsUUID()
  @IsNotEmpty()
  answerId!: string;
}

export class BulkReviewHomeworkAnswersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BulkReviewHomeworkAnswerItemDto)
  answers!: BulkReviewHomeworkAnswerItemDto[];
}

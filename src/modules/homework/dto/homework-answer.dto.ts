import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
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

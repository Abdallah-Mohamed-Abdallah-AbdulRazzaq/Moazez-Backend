import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PLACEMENT_TEST_STATUS_API_VALUES,
  type PlacementTestStatusApiValue,
} from '../domain/placement-test.enums';

export class ListPlacementTestsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(PLACEMENT_TEST_STATUS_API_VALUES)
  status?: PlacementTestStatusApiValue;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  type?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class CreatePlacementTestDto {
  @IsUUID()
  applicationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  type!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

export class UpdatePlacementTestDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'score must be a valid number with up to 2 decimal places' },
  )
  @Min(0)
  @Max(999.99)
  score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  result?: string;

  @IsOptional()
  @IsIn(PLACEMENT_TEST_STATUS_API_VALUES)
  status?: PlacementTestStatusApiValue;
}

export class PlacementTestResponseDto {
  id!: string;
  applicationId!: string;
  studentName!: string;
  subjectId!: string | null;
  subjectName!: string | null;
  type!: string;
  scheduledAt!: string | null;
  score!: number | null;
  result!: string | null;
  status!: PlacementTestStatusApiValue;
  createdAt!: string;
  updatedAt!: string;
}

export class PlacementTestsListResponseDto {
  items!: PlacementTestResponseDto[];
  pagination!: {
    page: number;
    limit: number;
    total: number;
  };
}

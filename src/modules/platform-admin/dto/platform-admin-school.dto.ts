import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SchoolStatus } from '@prisma/client';

export class ListPlatformSchoolsQueryDto {
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsEnum(SchoolStatus)
  status?: SchoolStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class CreatePlatformSchoolDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug!: string;
}

export class UpdatePlatformSchoolDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug?: string;
}

export class PlatformSchoolResponseDto {
  schoolId!: string;
  organizationId!: string;
  organizationName!: string;
  name!: string;
  slug!: string;
  status!: SchoolStatus;
  createdAt!: string;
  updatedAt!: string;
}

export class PlatformSchoolsPageInfoDto {
  limit!: number;
  nextCursor!: string | null;
  hasMore!: boolean;
}

export class PlatformSchoolsListResponseDto {
  generatedAt!: string;
  items!: PlatformSchoolResponseDto[];
  pageInfo!: PlatformSchoolsPageInfoDto;
  filters!: {
    organizationId?: string;
    status?: SchoolStatus;
    search?: string;
  };
}

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
import { OrganizationStatus } from '@prisma/client';

export class ListPlatformOrganizationsQueryDto {
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

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

export class CreatePlatformOrganizationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug!: string;
}

export class UpdatePlatformOrganizationDto {
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

export class PlatformOrganizationResponseDto {
  organizationId!: string;
  name!: string;
  slug!: string;
  status!: OrganizationStatus;
  schoolsCount!: number;
  activeSchoolsCount!: number;
  createdAt!: string;
  updatedAt!: string;
}

export class PlatformOrganizationsPageInfoDto {
  limit!: number;
  nextCursor!: string | null;
  hasMore!: boolean;
}

export class PlatformOrganizationsListResponseDto {
  generatedAt!: string;
  items!: PlatformOrganizationResponseDto[];
  pageInfo!: PlatformOrganizationsPageInfoDto;
  filters!: {
    status?: OrganizationStatus;
    search?: string;
  };
}

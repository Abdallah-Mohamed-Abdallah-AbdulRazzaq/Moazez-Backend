import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PublicDismissalGateStatus } from '../../shared/dismissal.types';

export class ListDismissalGatesQueryDto {
  @IsOptional()
  status?: string;

  @IsOptional()
  active?: string | boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateDismissalGateDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  campus?: string | null;

  @IsOptional()
  status?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number | null;

  @IsOptional()
  waitingZones?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

export class UpdateDismissalGateDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  campus?: string | null;

  @IsOptional()
  status?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number | null;

  @IsOptional()
  waitingZones?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

export class DismissalGateLocationDto {
  latitude!: number | null;
  longitude!: number | null;
}

export class DismissalGateResponseDto {
  id!: string;
  code!: string;
  name!: string;
  campus!: string | null;
  status!: PublicDismissalGateStatus;
  isActive!: boolean;
  sortOrder!: number;
  location!: DismissalGateLocationDto;
  waitingZones!: string[];
  notes!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class DismissalGatesSummaryDto {
  totalCount!: number;
  openCount!: number;
  busyCount!: number;
  closedCount!: number;
  maintenanceCount!: number;
  activeCount!: number;
}

export class DismissalGatesListResponseDto {
  data!: DismissalGateResponseDto[];
  summary!: DismissalGatesSummaryDto;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ListDiscoverableSchoolsQueryDto {
  @ApiPropertyOptional({
    description: 'Search safe public display fields such as name or city.',
    example: 'academy',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by public city display value.',
    example: 'Cairo',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Values above 100 are clamped to 100.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit = 20;
}

export class DiscoverableSchoolResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Moazez Academy' })
  name!: string;

  @ApiProperty({ example: 'Moazez', nullable: true })
  shortName!: string | null;

  @ApiProperty({ example: 'Cairo', nullable: true })
  city!: string | null;

  @ApiProperty({ example: 'Egypt', nullable: true })
  country!: string | null;

  @ApiProperty({
    example: 'New Cairo, Cairo, Egypt',
    nullable: true,
  })
  address!: string | null;

  @ApiProperty({
    example: 'https://assets.example.test/schools/moazez/logo.png',
    nullable: true,
  })
  logoUrl!: string | null;
}

export class DiscoverableSchoolsMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;
}

export class DiscoverableSchoolsListResponseDto {
  @ApiProperty({ type: [DiscoverableSchoolResponseDto] })
  data!: DiscoverableSchoolResponseDto[];

  @ApiProperty({ type: DiscoverableSchoolsMetaDto })
  meta!: DiscoverableSchoolsMetaDto;
}

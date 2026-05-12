import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListUsersQueryDto {
  @ApiPropertyOptional({
    description:
      'Search by full name, username, login email, or contact email.',
    example: 'nour',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter users by role id.',
    format: 'uuid',
  })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({
    description: 'Filter users by dashboard account status.',
    enum: ['active', 'invited', 'inactive'],
    example: 'active',
  })
  @IsOptional()
  @IsIn(['active', 'invited', 'inactive'])
  status?: 'active' | 'invited' | 'inactive';

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

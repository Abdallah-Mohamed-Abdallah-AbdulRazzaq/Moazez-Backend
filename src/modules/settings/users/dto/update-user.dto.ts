import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Updated dashboard display name.',
    example: 'Nour Ali',
    minLength: 1,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Updated school role id for this user membership.',
    format: 'uuid',
  })
  @IsOptional()
  @IsString()
  roleId?: string;
}

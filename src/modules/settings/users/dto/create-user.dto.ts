import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Display name entered by the school dashboard.',
    example: 'Nour Ali',
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @ApiPropertyOptional({
    description:
      'Legacy login email override. Prefer username/contactEmail when school login identity is configured.',
    example: 'nour.ali@demo-school.moazez.local',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'School-owned username used to generate the login email.',
    example: 'nour.ali',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @ApiPropertyOptional({
    description:
      'Personal/contact email used for credential delivery and communication.',
    example: 'nour.parent@example.com',
  })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiProperty({
    description: 'School role id assigned to the new user membership.',
    format: 'uuid',
  })
  @IsString()
  roleId!: string;
}

export class InviteUserDto {
  @ApiProperty({
    description: 'Display name entered by the school dashboard.',
    example: 'Nour Ali',
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @ApiPropertyOptional({
    description:
      'Legacy login email override. Prefer username/contactEmail when school login identity is configured.',
    example: 'nour.ali@demo-school.moazez.local',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'School-owned username used to generate the login email.',
    example: 'nour.ali',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @ApiPropertyOptional({
    description:
      'Personal/contact email used for credential delivery and communication.',
    example: 'nour.parent@example.com',
  })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiProperty({
    description: 'School role id assigned to the invited user membership.',
    format: 'uuid',
  })
  @IsString()
  roleId!: string;
}

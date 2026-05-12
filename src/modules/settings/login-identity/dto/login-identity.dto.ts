import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateLoginIdentitySettingsDto {
  @ApiProperty({
    description:
      'School-owned login email domain used to generate usernames as email identities.',
    example: 'demo-school.moazez.local',
    maxLength: 253,
  })
  @IsString()
  @MaxLength(253)
  loginDomain!: string;

  @ApiPropertyOptional({
    description: 'Minimum allowed username length for the school policy.',
    example: 3,
    minimum: 1,
    maximum: 64,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  usernameMinLength?: number;

  @ApiPropertyOptional({
    description: 'Maximum allowed username length for the school policy.',
    example: 32,
    minimum: 1,
    maximum: 64,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  usernameMaxLength?: number;

  @ApiPropertyOptional({
    description:
      'Human-readable username character policy shown to dashboard users.',
    example: 'lowercase letters, numbers, dots, underscores, and hyphens',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  allowedCharacters?: string;

  @ApiPropertyOptional({
    description:
      'Reserved usernames that cannot be assigned to users in this school.',
    example: ['admin', 'support', 'principal'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  reservedUsernames?: string[];

  @ApiPropertyOptional({
    description:
      'Whether generated login identities are active for this school.',
    enum: ['active', 'disabled'],
    example: 'active',
  })
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}

export class LoginIdentityPreviewQueryDto {
  @ApiProperty({
    description:
      'Username candidate to normalize and combine with the school login domain.',
    example: 'nour.ali',
    maxLength: 64,
  })
  @IsString()
  @MaxLength(64)
  username!: string;
}

export class UsernameAvailabilityQueryDto {
  @ApiProperty({
    description:
      'Username candidate to validate for availability in the current school scope.',
    example: 'nour.ali',
    maxLength: 64,
  })
  @IsString()
  @MaxLength(64)
  username!: string;
}

export class LoginIdentitySettingsResponseDto {
  @ApiProperty({
    description:
      'Whether the current school has saved login identity settings.',
    example: true,
  })
  configured!: boolean;

  @ApiProperty({
    description: 'Configured school login domain, or null when not configured.',
    example: 'demo-school.moazez.local',
    nullable: true,
  })
  loginDomain!: string | null;

  @ApiProperty({ example: 3, minimum: 1, maximum: 64 })
  usernameMinLength!: number;

  @ApiProperty({ example: 32, minimum: 1, maximum: 64 })
  usernameMaxLength!: number;

  @ApiProperty({
    example: 'lowercase letters, numbers, dots, underscores, and hyphens',
    nullable: true,
  })
  allowedCharacters!: string | null;

  @ApiProperty({ type: [String], example: ['admin', 'support'] })
  reservedUsernames!: string[];

  @ApiProperty({ enum: ['active', 'disabled'], example: 'active' })
  status!: 'active' | 'disabled';
}

export class LoginIdentityPreviewResponseDto {
  @ApiProperty({ example: 'nour.ali' })
  username!: string;

  @ApiProperty({ example: 'nour.ali@demo-school.moazez.local' })
  loginEmail!: string;
}

export class UsernameAvailabilityResponseDto {
  @ApiProperty({ example: 'nour.ali' })
  username!: string;

  @ApiProperty({
    example: 'nour.ali@demo-school.moazez.local',
    nullable: true,
  })
  loginEmail!: string | null;

  @ApiProperty({ example: true })
  available!: boolean;

  @ApiProperty({
    enum: [
      'username_invalid',
      'login_domain_missing',
      'login_email_taken',
      'reserved_username',
    ],
    nullable: true,
    example: null,
  })
  reason!:
    | null
    | 'username_invalid'
    | 'login_domain_missing'
    | 'login_email_taken'
    | 'reserved_username';
}

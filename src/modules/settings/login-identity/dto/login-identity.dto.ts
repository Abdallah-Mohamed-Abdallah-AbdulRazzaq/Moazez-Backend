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
  @IsString()
  @MaxLength(253)
  loginDomain!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  usernameMinLength?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  usernameMaxLength?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  allowedCharacters?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  reservedUsernames?: string[];

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}

export class LoginIdentityPreviewQueryDto {
  @IsString()
  @MaxLength(64)
  username!: string;
}

export class UsernameAvailabilityQueryDto {
  @IsString()
  @MaxLength(64)
  username!: string;
}

export class LoginIdentitySettingsResponseDto {
  configured!: boolean;
  loginDomain!: string | null;
  usernameMinLength!: number;
  usernameMaxLength!: number;
  allowedCharacters!: string | null;
  reservedUsernames!: string[];
  status!: 'active' | 'disabled';
}

export class LoginIdentityPreviewResponseDto {
  username!: string;
  loginEmail!: string;
}

export class UsernameAvailabilityResponseDto {
  username!: string;
  loginEmail!: string | null;
  available!: boolean;
  reason!:
    | null
    | 'username_invalid'
    | 'login_domain_missing'
    | 'login_email_taken'
    | 'reserved_username';
}

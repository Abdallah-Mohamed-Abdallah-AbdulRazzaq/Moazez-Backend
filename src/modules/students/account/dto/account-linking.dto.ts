import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CredentialUserSummaryDto } from '../../../settings/users/credentials/dto/credential.dto';

export class AccountLinkingDto {
  @IsIn(['create', 'link'])
  mode!: 'create' | 'link';

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  contactEmail?: string;

  @IsOptional()
  @IsBoolean()
  generatePassword?: boolean;

  @IsOptional()
  @IsIn(['generate', 'none'])
  temporaryPasswordMode?: 'generate' | 'none';

  @IsOptional()
  @IsUUID()
  roleId?: string;
}

export class StudentAccountLinkResponseDto {
  studentId!: string;
  user!: CredentialUserSummaryDto;
  linked!: true;
  temporaryPassword?: string;
}

export class GuardianAccountLinkResponseDto {
  guardianId!: string;
  user!: CredentialUserSummaryDto;
  linked!: true;
  temporaryPassword?: string;
}

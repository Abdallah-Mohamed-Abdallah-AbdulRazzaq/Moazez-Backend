import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { StudentSummaryResponseDto } from '../../students/dto/student.dto';

export class ListGuardiansQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  relation?: string;
}

class GuardianMutationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  relation?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone_primary?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone_secondary?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  national_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  job_title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  workplace?: string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @IsOptional()
  @IsBoolean()
  can_pickup?: boolean;

  @IsOptional()
  @IsBoolean()
  can_receive_notifications?: boolean;
}

export class CreateGuardianDto extends GuardianMutationDto {}

export class UpdateGuardianDto extends GuardianMutationDto {}

export class LinkGuardianToStudentDto {
  @IsUUID()
  guardianId!: string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}

export class UpdateStudentGuardianLinkDto {
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}

export class GuardianResponseDto {
  guardianId!: string;
  full_name!: string;
  relation!: string;
  phone_primary!: string;
  phone_secondary!: string | null;
  email!: string | null;
  national_id!: string | null;
  job_title!: string | null;
  workplace!: string | null;
  is_primary!: boolean;
  can_pickup!: boolean | null;
  can_receive_notifications!: boolean | null;
}

export class GuardianWithStudentsResponseDto {
  guardian!: GuardianResponseDto;
  students!: StudentSummaryResponseDto[];
}

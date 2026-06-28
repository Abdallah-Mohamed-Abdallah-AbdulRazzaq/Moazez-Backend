import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEmail,
  IsIn,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { GuardianResponseDto } from '../../guardians/dto/guardian.dto';
import { EnrollmentResponseDto } from '../../enrollments/dto/enrollment.dto';
import { StudentResponseDto } from '../../students/dto/student.dto';
import { CREDENTIAL_STATUS_VALUES } from '../../../settings/users/credentials/dto/credential.dto';
import { STUDENT_STATUS_API_VALUES } from '../../students/domain/student-status.enums';
import type { StudentStatusApiValue } from '../../students/domain/student-status.enums';

export class SchoolRegistrationStudentContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address_line?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string | null;

  @IsOptional()
  @IsPhoneNumber()
  student_phone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  student_email?: string | null;
}

export class SchoolRegistrationStudentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  first_name_en?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  father_name_en?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  grandfather_name_en?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  family_name_en?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  first_name_ar?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  father_name_ar?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  grandfather_name_ar?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  family_name_ar?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  full_name_en?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  full_name_ar?: string | null;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gender?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nationality?: string | null;

  @IsOptional()
  @IsIn(STUDENT_STATUS_API_VALUES)
  status?: StudentStatusApiValue;

  @IsOptional()
  @ValidateNested()
  @Type(() => SchoolRegistrationStudentContactDto)
  contact?: SchoolRegistrationStudentContactDto | null;
}

export class SchoolRegistrationGuardianProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  full_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  first_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  last_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  relation?: string | null;

  @IsOptional()
  @IsPhoneNumber()
  phone_primary?: string | null;

  @IsOptional()
  @IsPhoneNumber()
  phone_secondary?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  national_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  job_title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  workplace?: string | null;

  @IsOptional()
  @IsBoolean()
  can_pickup?: boolean | null;

  @IsOptional()
  @IsBoolean()
  can_receive_notifications?: boolean | null;
}

export class SchoolRegistrationGuardianRelationshipDto {
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}

export class SchoolRegistrationAccountDto {
  @IsIn(['none', 'create', 'link'])
  mode!: 'none' | 'create' | 'link';

  @ValidateIf((dto: SchoolRegistrationAccountDto) => dto.mode === 'link')
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @ValidateIf((dto: SchoolRegistrationAccountDto) => dto.mode === 'create')
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

export class SchoolRegistrationGuardianDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => SchoolRegistrationGuardianProfileDto)
  profile!: SchoolRegistrationGuardianProfileDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SchoolRegistrationGuardianRelationshipDto)
  relationship?: SchoolRegistrationGuardianRelationshipDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SchoolRegistrationAccountDto)
  account?: SchoolRegistrationAccountDto;
}

export class SchoolRegistrationEnrollmentDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  academicYear?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  grade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  section?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  classroom?: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsUUID()
  classroomId!: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsDateString()
  enrollmentDate!: string;

  @IsOptional()
  @IsIn(['active'])
  status?: 'active';
}

export class CreateSchoolRegistrationDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => SchoolRegistrationStudentDto)
  student!: SchoolRegistrationStudentDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SchoolRegistrationGuardianDto)
  guardians!: SchoolRegistrationGuardianDto[];

  @IsDefined()
  @ValidateNested()
  @Type(() => SchoolRegistrationEnrollmentDto)
  enrollment!: SchoolRegistrationEnrollmentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SchoolRegistrationAccountDto)
  studentAccount?: SchoolRegistrationAccountDto;
}

export class SchoolRegistrationAccountUserSummaryDto {
  fullName!: string;
  username!: string | null;
  loginEmail!: string;
  contactEmail!: string | null;
  userType!: 'parent' | 'student';
  roleKey!: string;
  roleName!: string;
  credentialStatus!: (typeof CREDENTIAL_STATUS_VALUES)[number];
  hasPassword!: boolean;
  mustChangePassword!: boolean;
}

export class SchoolRegistrationAccountSummaryDto {
  target!: 'parent' | 'student';
  guardianId?: string;
  mode!: 'none' | 'create' | 'link';
  status!: 'skipped' | 'created' | 'linked' | 'failed';
  user?: SchoolRegistrationAccountUserSummaryDto;
  temporaryPassword?: string;
}

export class SchoolRegistrationResponseDto {
  registrationId!: string;
  student!: StudentResponseDto;
  guardians!: GuardianResponseDto[];
  enrollment!: EnrollmentResponseDto;
  parentAccounts!: SchoolRegistrationAccountSummaryDto[];
  studentAccount!: SchoolRegistrationAccountSummaryDto;
  warnings!: string[];
  createdAt!: string;
  completedAt!: string;
}

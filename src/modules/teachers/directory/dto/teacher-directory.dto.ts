import { Type } from 'class-transformer';
import {
  MembershipStatus,
  TeacherEmploymentStatus,
  TeacherEmploymentType,
  TeacherGender,
  TeacherWorkDay,
  UserStatus,
} from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { TeacherCredentialStatus } from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import type { TeacherProfileCompletenessField } from '../../profile/domain/teacher-profile.types';
import type {
  PreferredDisplayLanguage,
  TeacherProfileCompletenessFilter,
} from '../domain/teacher-directory.types';

export class ListTeachersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  accountStatus?: UserStatus;

  @IsOptional()
  @IsEnum(MembershipStatus)
  membershipStatus?: MembershipStatus;

  @IsOptional()
  @IsEnum(TeacherEmploymentStatus)
  employmentStatus?: TeacherEmploymentStatus;

  @IsOptional()
  @IsEnum(TeacherGender)
  gender?: TeacherGender;

  @IsOptional()
  @IsIn(['complete', 'incomplete'])
  profileCompleteness?: TeacherProfileCompletenessFilter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class UpdateTeacherDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  loginEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  username?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  contactEmail?: string | null;

  @IsOptional()
  @IsPhoneNumber()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  teacherCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstNameAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastNameAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstNameEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastNameEn?: string | null;

  @IsOptional()
  @IsIn(['AR', 'EN'])
  preferredDisplayLanguage?: PreferredDisplayLanguage;

  @IsOptional()
  @IsEnum(TeacherGender)
  gender?: TeacherGender;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  specialization?: string | null;

  @IsOptional()
  @IsEnum(TeacherEmploymentType)
  employmentType?: TeacherEmploymentType | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  experienceYears?: number | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  hireDate?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsEnum(TeacherWorkDay, { each: true })
  workingDays?: TeacherWorkDay[];

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}(?::\d{2})?$/u)
  workStartTime?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}(?::\d{2})?$/u)
  workEndTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notesAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notesEn?: string | null;
}

export class TeacherCredentialSummaryDto {
  hasPassword!: boolean;
  status!: TeacherCredentialStatus;
  mustChangePassword!: boolean;
  passwordProvisionedAt!: string | null;
  passwordChangedAt!: string | null;
  credentialVersion!: number;
}

export class TeacherProfileCompletenessDto {
  isComplete!: boolean;
  missingFields!: TeacherProfileCompletenessField[];
}

export class TeacherDirectoryListItemDto {
  id!: string;
  userId!: string;
  loginEmail!: string;
  username!: string | null;
  contactEmail!: string | null;
  phone!: string | null;
  teacherCode!: string | null;
  firstNameAr!: string | null;
  lastNameAr!: string | null;
  firstNameEn!: string | null;
  lastNameEn!: string | null;
  displayName!: { firstName: string; lastName: string; fullName: string };
  gender!: TeacherGender | null;
  department!: string | null;
  specialization!: string | null;
  accountStatus!: UserStatus;
  membershipStatus!: MembershipStatus;
  membershipEndedAt!: string | null;
  employmentStatus!: TeacherEmploymentStatus;
  profileCompleteness!: TeacherProfileCompletenessDto;
  credentialSummary!: TeacherCredentialSummaryDto;
  createdAt!: string;
  updatedAt!: string;
}

export class TeacherDirectoryDetailDto extends TeacherDirectoryListItemDto {
  employmentType!: TeacherEmploymentType | null;
  experienceYears!: number | null;
  hireDate!: string | null;
  workingDays!: TeacherWorkDay[];
  workStartTime!: string | null;
  workEndTime!: string | null;
  notesAr!: string | null;
  notesEn!: string | null;
}

export class TeachersListResponseDto {
  items!: TeacherDirectoryListItemDto[];
  pagination!: { page: number; limit: number; total: number };
}

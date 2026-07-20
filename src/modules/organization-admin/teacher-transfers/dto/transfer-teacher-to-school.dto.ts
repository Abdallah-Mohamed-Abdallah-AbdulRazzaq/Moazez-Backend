import { Type } from 'class-transformer';
import {
  TeacherEmploymentType,
  TeacherGender,
  TeacherWorkDay,
} from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class TransferTeacherToSchoolDto {
  @IsUUID()
  destinationSchoolId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  teacherCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstNameAr!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastNameAr!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstNameEn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastNameEn!: string;

  @IsIn(['AR', 'EN'])
  preferredDisplayLanguage!: 'AR' | 'EN';

  @IsEnum(TeacherGender)
  gender!: TeacherGender;

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
  @Type(() => Number)
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
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/u)
  workStartTime?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/u)
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

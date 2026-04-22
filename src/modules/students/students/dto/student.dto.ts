import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  STUDENT_STATUS_API_VALUES,
  type StudentStatusApiValue,
} from '../domain/student-status.enums';

export class ListStudentsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(STUDENT_STATUS_API_VALUES)
  status?: StudentStatusApiValue;
}

export class StudentContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address_line?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsPhoneNumber()
  student_phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  student_email?: string;
}

class StudentMutationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  first_name_en?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  father_name_en?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  grandfather_name_en?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  family_name_en?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  first_name_ar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  father_name_ar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  grandfather_name_ar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  family_name_ar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  full_name_en?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  full_name_ar?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nationality?: string;

  @IsOptional()
  @IsIn(STUDENT_STATUS_API_VALUES)
  status?: StudentStatusApiValue;

  @IsOptional()
  @ValidateNested()
  @Type(() => StudentContactDto)
  contact?: StudentContactDto;
}

export class CreateStudentDto extends StudentMutationDto {}

export class UpdateStudentDto extends StudentMutationDto {}

export class StudentContactResponseDto {
  address_line!: string | null;
  city!: string | null;
  district!: string | null;
  student_phone!: string | null;
  student_email!: string | null;
}

export class StudentResponseDto {
  id!: string;
  student_id!: string | null;
  name!: string;
  first_name_en!: string;
  father_name_en!: string | null;
  grandfather_name_en!: string | null;
  family_name_en!: string;
  first_name_ar!: string | null;
  father_name_ar!: string | null;
  grandfather_name_ar!: string | null;
  family_name_ar!: string | null;
  full_name_en!: string;
  full_name_ar!: string | null;
  dateOfBirth!: string | null;
  date_of_birth!: string | null;
  gender!: string | null;
  nationality!: string | null;
  status!: StudentStatusApiValue;
  contact!: StudentContactResponseDto;
  created_at!: string;
  updated_at!: string;
}

export class StudentSummaryResponseDto {
  id!: string;
  student_id!: string | null;
  name!: string;
  full_name_en!: string;
  status!: StudentStatusApiValue;
}

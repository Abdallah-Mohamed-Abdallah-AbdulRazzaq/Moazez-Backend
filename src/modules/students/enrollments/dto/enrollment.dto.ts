import { IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  STUDENT_ENROLLMENT_STATUS_API_VALUES,
  type StudentEnrollmentStatusApiValue,
} from '../domain/enrollment-status.enums';

export class ListEnrollmentsQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  academicYear?: string;

  @IsOptional()
  @IsIn(STUDENT_ENROLLMENT_STATUS_API_VALUES)
  status?: StudentEnrollmentStatusApiValue;
}

export class CurrentEnrollmentQueryDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  academicYear?: string;
}

export class EnrollmentHistoryQueryDto {
  @IsUUID()
  studentId!: string;
}

class EnrollmentMutationDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsUUID()
  applicationId?: string;

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

export class CreateEnrollmentDto extends EnrollmentMutationDto {}

export class UpsertEnrollmentDto extends EnrollmentMutationDto {}

export class ValidateEnrollmentDto extends EnrollmentMutationDto {
  @IsOptional()
  @IsUUID()
  enrollmentId?: string;
}

export class EnrollmentResponseDto {
  enrollmentId!: string;
  studentId!: string;
  academicYear!: string;
  academicYearId!: string;
  grade!: string;
  section!: string;
  classroom!: string;
  gradeId!: string;
  sectionId!: string;
  classroomId!: string;
  enrollmentDate!: string;
  status!: StudentEnrollmentStatusApiValue;
}

export class EnrollmentAcademicYearResponseDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  isActive!: boolean;
}

export class ValidateEnrollmentResponseDto {
  valid!: boolean;

  @IsArray()
  errors!: string[];
}

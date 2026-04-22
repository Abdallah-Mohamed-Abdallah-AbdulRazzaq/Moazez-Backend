import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  ENROLLMENT_MOVEMENT_ACTION_TYPES,
  type EnrollmentMovementActionType,
} from '../domain/enrollment-lifecycle.enums';

class EnrollmentLifecycleCommandDto {
  @IsUUID()
  studentId!: string;

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  sourceRequestId?: string | null;
}

export class TransferEnrollmentDto extends EnrollmentLifecycleCommandDto {
  @IsUUID()
  targetSectionId!: string;

  @IsUUID()
  targetClassroomId!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class WithdrawEnrollmentDto extends EnrollmentLifecycleCommandDto {
  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsIn(['withdrawn'])
  actionType!: 'withdrawn';
}

export class PromoteEnrollmentDto {
  @IsUUID()
  studentId!: string;

  @IsString()
  @MaxLength(120)
  targetAcademicYear!: string;

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class EnrollmentMovementResponseDto {
  id!: string;
  studentId!: string;
  academicYear!: string;
  actionType!: EnrollmentMovementActionType;
  fromGradeId!: string;
  fromSectionId!: string;
  fromClassroomId!: string;
  toGradeId!: string | null;
  toSectionId!: string | null;
  toClassroomId!: string | null;
  fromGrade!: string;
  fromSection!: string;
  fromClassroom!: string;
  toGrade!: string | null;
  toSection!: string | null;
  toClassroom!: string | null;
  effectiveDate!: string;
  reason!: string | null;
  notes!: string | null;
  sourceRequestId!: string | null;
  createdAt!: string;
}

export const ENROLLMENT_MOVEMENT_RESPONSE_TYPES =
  ENROLLMENT_MOVEMENT_ACTION_TYPES;

import { Type } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const PROFILE_CORRECTION_REQUEST_STATUS_VALUES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;

export type ProfileCorrectionRequestStatusValue =
  (typeof PROFILE_CORRECTION_REQUEST_STATUS_VALUES)[number];

export class SubmitStudentProfileCorrectionRequestDto {
  @IsObject()
  changes!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}

export class ListProfileCorrectionRequestsQueryDto {
  @IsOptional()
  @IsIn(PROFILE_CORRECTION_REQUEST_STATUS_VALUES)
  status?: ProfileCorrectionRequestStatusValue;

  @IsOptional()
  @IsUUID()
  studentId?: string;
}

export class ReviewProfileCorrectionRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewerNote?: string | null;
}

export class StudentProfileCorrectionRequestResponseDto {
  id!: string;
  status!: ProfileCorrectionRequestStatusValue;
  requestedChanges!: Record<string, unknown>;
  reason!: string | null;
  reviewerNote!: string | null;
  submittedAt!: string;
  resolvedAt!: string | null;
  cancelledAt!: string | null;
}

export class StaffProfileCorrectionStudentSummaryDto {
  studentId!: string;
  displayName!: string;
  studentNumber!: string | null;
  firstName!: string;
  lastName!: string;
  status!: string;
}

export class StaffProfileCorrectionRequestResponseDto extends StudentProfileCorrectionRequestResponseDto {
  @Type(() => StaffProfileCorrectionStudentSummaryDto)
  student!: StaffProfileCorrectionStudentSummaryDto;

  currentSnapshot!: Record<string, unknown> | null;
}

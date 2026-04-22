import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  APPLICATION_SOURCE_API_VALUES,
  APPLICATION_STATUS_API_VALUES,
} from '../domain/application.enums';
import type {
  ApplicationSourceApiValue,
  ApplicationStatusApiValue,
} from '../domain/application.enums';

export class ListApplicationsQueryDto {
  @IsOptional()
  @IsIn(APPLICATION_STATUS_API_VALUES)
  status?: ApplicationStatusApiValue;
}

export class CreateApplicationDto {
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  studentName!: string;

  @IsOptional()
  @IsUUID()
  requestedAcademicYearId?: string;

  @IsOptional()
  @IsUUID()
  requestedGradeId?: string;

  @IsIn(APPLICATION_SOURCE_API_VALUES)
  source!: ApplicationSourceApiValue;
}

export class UpdateApplicationDto {
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  studentName?: string;

  @IsOptional()
  @IsUUID()
  requestedAcademicYearId?: string;

  @IsOptional()
  @IsUUID()
  requestedGradeId?: string;

  @IsOptional()
  @IsIn(APPLICATION_SOURCE_API_VALUES)
  source?: ApplicationSourceApiValue;
}

export class ApplicationResponseDto {
  id!: string;
  leadId!: string | null;
  studentName!: string;
  requestedAcademicYearId!: string | null;
  requestedGradeId!: string | null;
  source!: ApplicationSourceApiValue;
  status!: ApplicationStatusApiValue;
  submittedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class EnrollApplicationHandoffParamsDto {
  @IsUUID()
  id!: string;
}

export class ApplicationHandoffStudentDraftDto {
  fullName!: string;
}

export class ApplicationHandoffGuardianDraftDto {
  fullName!: string | null;
  phone!: string | null;
  email!: string | null;
}

export class ApplicationHandoffEnrollmentDraftDto {
  requestedAcademicYearId!: string | null;
  requestedAcademicYearName!: string | null;
  requestedGradeId!: string | null;
  requestedGradeName!: string | null;
}

export class ApplicationEnrollmentHandoffDto {
  studentDraft!: ApplicationHandoffStudentDraftDto;
  guardianDrafts!: ApplicationHandoffGuardianDraftDto[];
  enrollmentDraft!: ApplicationHandoffEnrollmentDraftDto;
}

export class ApplicationEnrollmentHandoffResponseDto {
  applicationId!: string;
  eligible!: boolean;
  handoff!: ApplicationEnrollmentHandoffDto;
}

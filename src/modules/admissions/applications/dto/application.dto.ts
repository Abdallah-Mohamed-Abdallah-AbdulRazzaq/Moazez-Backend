import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  APPLICATION_SOURCE_API_VALUES,
  APPLICATION_STATUS_API_VALUES,
} from '../domain/application.enums';
import type {
  ApplicationSourceApiValue,
  ApplicationStatusApiValue,
} from '../domain/application.enums';
import { ApplicationDashboardStateDto } from './application-dashboard-state.dto';

export class ListApplicationsQueryDto {
  @ApiPropertyOptional({ enum: APPLICATION_STATUS_API_VALUES })
  @IsOptional()
  @IsIn(APPLICATION_STATUS_API_VALUES)
  status?: ApplicationStatusApiValue;
}

export class CreateApplicationDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiProperty({ example: 'Layla Hassan', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  studentName!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  requestedAcademicYearId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  requestedGradeId?: string;

  @ApiProperty({ enum: APPLICATION_SOURCE_API_VALUES, example: 'in_app' })
  @IsIn(APPLICATION_SOURCE_API_VALUES)
  source!: ApplicationSourceApiValue;
}

export class UpdateApplicationDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({
    example: 'Layla Hassan',
    minLength: 1,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  studentName?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  requestedAcademicYearId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  requestedGradeId?: string;

  @ApiPropertyOptional({
    enum: APPLICATION_SOURCE_API_VALUES,
    example: 'in_app',
  })
  @IsOptional()
  @IsIn(APPLICATION_SOURCE_API_VALUES)
  source?: ApplicationSourceApiValue;
}

export class ApplicationRegistrationStateDto {
  @ApiProperty({ example: false })
  registered!: boolean;

  @ApiProperty({ format: 'uuid', nullable: true })
  studentId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  enrollmentId!: string | null;

  @ApiProperty({ example: 'active', nullable: true })
  enrollmentStatus!: string | null;

  @ApiProperty({
    enum: ['admissions_application'],
    nullable: true,
    example: null,
  })
  registeredVia!: 'admissions_application' | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  registeredAt!: string | null;

  @ApiProperty({
    enum: ['derived_from_student_application_id'],
    example: 'derived_from_student_application_id',
  })
  source!: 'derived_from_student_application_id';
}

export class ApplicationDocumentsSummaryDto {
  @ApiProperty({ example: 1 })
  totalCount!: number;

  @ApiProperty({ example: 0 })
  completeCount!: number;

  @ApiProperty({ example: 0 })
  missingCount!: number;

  @ApiProperty({ example: 1 })
  pendingReviewCount!: number;

  @ApiProperty({ example: 1 })
  reviewableCount!: number;

  @ApiProperty({ example: 1 })
  applicantPortalCount!: number;

  @ApiProperty({ example: 0 })
  staffUploadCount!: number;

  @ApiProperty({ example: 0 })
  needsReplacementCount!: number;

  @ApiProperty({ example: true })
  hasPendingReview!: boolean;

  @ApiProperty({ example: true })
  hasReviewableDocuments!: boolean;

  @ApiProperty({ example: false })
  hasMissingDocuments!: boolean;
}

export class ApplicationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  leadId!: string | null;

  @ApiProperty({ example: 'Layla Hassan' })
  studentName!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  requestedAcademicYearId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  requestedGradeId!: string | null;

  @ApiProperty({ enum: APPLICATION_SOURCE_API_VALUES, example: 'in_app' })
  source!: ApplicationSourceApiValue;

  @ApiProperty({ enum: APPLICATION_STATUS_API_VALUES, example: 'submitted' })
  status!: ApplicationStatusApiValue;

  @ApiProperty({ format: 'date-time', nullable: true })
  submittedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: ApplicationRegistrationStateDto })
  registrationState!: ApplicationRegistrationStateDto;

  @ApiProperty({ type: ApplicationDocumentsSummaryDto })
  documentsSummary!: ApplicationDocumentsSummaryDto;

  @ApiProperty({ type: ApplicationDashboardStateDto })
  dashboardState!: ApplicationDashboardStateDto;
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

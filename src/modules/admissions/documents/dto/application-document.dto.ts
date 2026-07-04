import { FileVisibility } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { APPLICATION_DOCUMENT_STATUS_API_VALUES } from '../../applications/domain/application.enums';
import type { ApplicationDocumentStatusApiValue } from '../../applications/domain/application.enums';

const APPLICATION_DOCUMENT_SOURCE_API_VALUES = [
  'staff_upload',
  'applicant_portal',
] as const;

const APPLICATION_DOCUMENT_REVIEW_ELIGIBILITY_REASON_VALUES = [
  'reviewable',
  'application_status_not_reviewable',
  'document_not_pending_review',
  'not_applicant_portal_document',
  'applicant_document_not_uploaded',
] as const;

const LINKED_APPLICANT_DOCUMENT_STATUS_API_VALUES = [
  'uploaded',
  'accepted',
  'rejected',
  'needs_replacement',
  'superseded',
] as const;

const STAFF_CREATABLE_APPLICATION_DOCUMENT_STATUS_API_VALUES = [
  'complete',
  'missing',
] as const;

export type ApplicationDocumentSourceApiValue =
  (typeof APPLICATION_DOCUMENT_SOURCE_API_VALUES)[number];

export type ApplicationDocumentReviewEligibilityReason =
  (typeof APPLICATION_DOCUMENT_REVIEW_ELIGIBILITY_REASON_VALUES)[number];

export type LinkedApplicantDocumentStatusApiValue =
  (typeof LINKED_APPLICANT_DOCUMENT_STATUS_API_VALUES)[number];

export class CreateApplicationDocumentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fileId!: string;

  @ApiProperty({ example: 'birth_certificate', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  documentType!: string;

  @ApiPropertyOptional({
    enum: STAFF_CREATABLE_APPLICATION_DOCUMENT_STATUS_API_VALUES,
    default: 'complete',
    description:
      'Staff uploads may set complete or missing. pending_review is reserved for Applicant Portal bridged documents.',
  })
  @IsOptional()
  @IsIn(APPLICATION_DOCUMENT_STATUS_API_VALUES)
  status?: ApplicationDocumentStatusApiValue;

  @ApiPropertyOptional({ example: 'School office copy', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ReviewApplicationDocumentDto {
  @ApiPropertyOptional({ example: 'Verified', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class RequireApplicationDocumentReviewNoteDto {
  @ApiProperty({ example: 'Blurry scan', minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note!: string;
}

export class ApplicationDocumentFileSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'birth-certificate.pdf' })
  originalName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: '12345' })
  sizeBytes!: string;

  @ApiProperty({ enum: FileVisibility, example: FileVisibility.PRIVATE })
  visibility!: FileVisibility;
}

export class ApplicationDocumentReviewEligibilityDto {
  @ApiProperty({ example: true })
  canAccept!: boolean;

  @ApiProperty({ example: true })
  canReject!: boolean;

  @ApiProperty({ example: true })
  canRequestReplacement!: boolean;

  @ApiProperty({
    enum: APPLICATION_DOCUMENT_REVIEW_ELIGIBILITY_REASON_VALUES,
    example: 'reviewable',
  })
  reason!: ApplicationDocumentReviewEligibilityReason;
}

export class LinkedApplicantDocumentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: LINKED_APPLICANT_DOCUMENT_STATUS_API_VALUES,
    example: 'uploaded',
  })
  status!: LinkedApplicantDocumentStatusApiValue;
}

export class ApplicationDocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  applicationId!: string;

  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiProperty({ example: 'birth_certificate' })
  documentType!: string;

  @ApiProperty({
    enum: APPLICATION_DOCUMENT_STATUS_API_VALUES,
    example: 'pending_review',
  })
  status!: ApplicationDocumentStatusApiValue;

  @ApiProperty({
    enum: APPLICATION_DOCUMENT_SOURCE_API_VALUES,
    example: 'applicant_portal',
  })
  source!: ApplicationDocumentSourceApiValue;

  @ApiProperty({ example: true })
  canReview!: boolean;

  @ApiProperty({ type: ApplicationDocumentReviewEligibilityDto })
  reviewEligibility!: ApplicationDocumentReviewEligibilityDto;

  @ApiProperty({ type: LinkedApplicantDocumentDto, nullable: true })
  linkedApplicantDocument!: LinkedApplicantDocumentDto | null;

  @ApiProperty({ example: 'Verified', nullable: true })
  notes!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: ApplicationDocumentFileSummaryDto })
  file!: ApplicationDocumentFileSummaryDto;
}

export class DeleteApplicationDocumentResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;
}

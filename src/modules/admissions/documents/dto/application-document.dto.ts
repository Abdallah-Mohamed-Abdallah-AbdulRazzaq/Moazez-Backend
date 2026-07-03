import { FileVisibility } from '@prisma/client';
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

export type ApplicationDocumentSourceApiValue =
  | 'staff_upload'
  | 'applicant_portal';

export type ApplicationDocumentReviewEligibilityReason =
  | 'reviewable'
  | 'application_status_not_reviewable'
  | 'document_not_pending_review'
  | 'not_applicant_portal_document'
  | 'applicant_document_not_uploaded';

export type LinkedApplicantDocumentStatusApiValue =
  | 'uploaded'
  | 'accepted'
  | 'rejected'
  | 'needs_replacement'
  | 'superseded';

export class CreateApplicationDocumentDto {
  @IsUUID()
  fileId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  documentType!: string;

  @IsOptional()
  @IsIn(APPLICATION_DOCUMENT_STATUS_API_VALUES)
  status?: ApplicationDocumentStatusApiValue;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ReviewApplicationDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class RequireApplicationDocumentReviewNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note!: string;
}

export class ApplicationDocumentFileSummaryDto {
  id!: string;
  originalName!: string;
  mimeType!: string;
  sizeBytes!: string;
  visibility!: FileVisibility;
}

export class ApplicationDocumentReviewEligibilityDto {
  canAccept!: boolean;
  canReject!: boolean;
  canRequestReplacement!: boolean;
  reason!: ApplicationDocumentReviewEligibilityReason;
}

export class LinkedApplicantDocumentDto {
  id!: string;
  status!: LinkedApplicantDocumentStatusApiValue;
}

export class ApplicationDocumentResponseDto {
  id!: string;
  applicationId!: string;
  fileId!: string;
  documentType!: string;
  status!: ApplicationDocumentStatusApiValue;
  source!: ApplicationDocumentSourceApiValue;
  canReview!: boolean;
  reviewEligibility!: ApplicationDocumentReviewEligibilityDto;
  linkedApplicantDocument!: LinkedApplicantDocumentDto | null;
  notes!: string | null;
  createdAt!: string;
  updatedAt!: string;
  file!: ApplicationDocumentFileSummaryDto;
}

export class DeleteApplicationDocumentResponseDto {
  ok!: boolean;
}

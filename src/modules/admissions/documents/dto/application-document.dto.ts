import { FileVisibility } from '@prisma/client';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  APPLICATION_DOCUMENT_STATUS_API_VALUES,
} from '../../applications/domain/application.enums';
import type { ApplicationDocumentStatusApiValue } from '../../applications/domain/application.enums';

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

export class ApplicationDocumentFileSummaryDto {
  id!: string;
  originalName!: string;
  mimeType!: string;
  sizeBytes!: string;
  visibility!: FileVisibility;
}

export class ApplicationDocumentResponseDto {
  id!: string;
  applicationId!: string;
  fileId!: string;
  documentType!: string;
  status!: ApplicationDocumentStatusApiValue;
  notes!: string | null;
  createdAt!: string;
  updatedAt!: string;
  file!: ApplicationDocumentFileSummaryDto;
}

export class DeleteApplicationDocumentResponseDto {
  ok!: boolean;
}

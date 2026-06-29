import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  STUDENT_DOCUMENT_STATUS_API_VALUES,
  type StudentDocumentStatusApiValue,
} from '../domain/student-document-status.enums';

export const IMPORT_APPLICATION_DOCUMENT_LIMIT = 25;

export class CreateStudentDocumentDto {
  @IsString()
  @MaxLength(160)
  type!: string;

  @IsOptional()
  @IsUUID()
  fileId?: string;

  @IsOptional()
  @IsIn(STUDENT_DOCUMENT_STATUS_API_VALUES)
  status?: StudentDocumentStatusApiValue;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  // Compatibility fields from the adapter contract. The backend keeps
  // file ownership in Files metadata and serves downloads through the
  // secure Files flow instead of trusting client-provided URLs.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  fileType?: string;
}

export class UpdateStudentDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  type?: string;

  @IsOptional()
  @IsUUID()
  fileId?: string;

  @IsOptional()
  @IsIn(STUDENT_DOCUMENT_STATUS_API_VALUES)
  status?: StudentDocumentStatusApiValue;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  fileType?: string;
}

export class StudentDocumentResponseDto {
  id!: string;
  studentId!: string;
  fileId!: string;
  type!: string;
  name!: string;
  status!: StudentDocumentStatusApiValue;
  uploadedDate!: string;
  url!: string;
  fileType!: string | null;
  notes!: string | null;
}

export class ImportStudentDocumentsFromApplicationDto {
  @IsUUID()
  applicationId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(IMPORT_APPLICATION_DOCUMENT_LIMIT)
  @IsUUID(undefined, { each: true })
  applicationDocumentIds!: string[];
}

export class ImportedStudentDocumentSourceDto {
  sourceApplicationId!: string;
  sourceApplicationDocumentId!: string;
  sourceApplicantRequestDocumentId!: string | null;
}

export class ImportedStudentDocumentDto {
  applicationDocumentId!: string;
  studentDocument!: StudentDocumentResponseDto;
  source!: ImportedStudentDocumentSourceDto;
}

export class SkippedStudentDocumentImportDto {
  applicationDocumentId!: string;
  reason!: 'already_imported';
  studentDocumentId!: string;
}

export class ImportStudentDocumentsFromApplicationResponseDto {
  studentId!: string;
  applicationId!: string;
  imported!: ImportedStudentDocumentDto[];
  skipped!: SkippedStudentDocumentImportDto[];
  warnings!: string[];
}

export class DeleteStudentDocumentResponseDto {
  ok!: boolean;
}

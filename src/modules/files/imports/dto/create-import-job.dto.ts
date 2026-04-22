import { ImportJobStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { Allow, IsString, MaxLength } from 'class-validator';
import { FILES_IMPORT_ALLOWED_TYPES } from '../domain/import-upload.constraints';

export class CreateImportJobRequestDto {
  @ApiProperty({
    enum: FILES_IMPORT_ALLOWED_TYPES,
    example: FILES_IMPORT_ALLOWED_TYPES[0],
  })
  @IsString()
  @MaxLength(64)
  type!: string;

  @ApiProperty({
    type: 'string',
    format: 'binary',
  })
  @Allow()
  file!: unknown;
}

export class ImportJobStatusResponseDto {
  id!: string;
  uploadedFileId!: string;
  type!: string;
  status!: ImportJobStatus;
  reportAvailable!: boolean;
  createdAt!: string;
  updatedAt!: string;
}

export class ImportJobReportSummaryDto {
  rowCount!: number | null;
  warningCount!: number;
  errorCount!: number;
}

export class ImportJobReportFileDto {
  uploadedFileId!: string;
  originalName!: string;
  mimeType!: string;
  sizeBytes!: string;
}

export class ImportJobReportResponseDto {
  status!: ImportJobStatus;
  summary!: ImportJobReportSummaryDto;
  file!: ImportJobReportFileDto;
  rowCount!: number | null;
  warnings!: string[];
  errors!: string[];
  updatedAt!: string;
}

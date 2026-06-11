import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export type ApplicantDocumentApiStatus =
  | 'uploaded'
  | 'needs_replacement'
  | 'accepted'
  | 'rejected'
  | 'superseded';

export class UploadApplicantDocumentRequestDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  @Allow()
  file!: unknown;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  requiredDocumentId?: string;

  @ApiPropertyOptional({ example: 'Birth certificate', maxLength: 180 })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @ApiPropertyOptional({ example: 'birth_certificate', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  documentType?: string;

  @ApiPropertyOptional({
    example: 'Uploaded a scanned copy.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ReplaceApplicantDocumentRequestDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  @Allow()
  file!: unknown;

  @ApiPropertyOptional({ example: 'Birth certificate', maxLength: 180 })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @ApiPropertyOptional({ example: 'birth_certificate', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  documentType?: string;

  @ApiPropertyOptional({
    example: 'Uploaded a replacement copy.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class DeleteApplicantDocumentResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;
}

export class ApplicantDocumentRequiredDocumentSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Birth certificate' })
  title!: string;

  @ApiProperty({ example: true })
  isMandatory!: boolean;
}

export class ApplicantDocumentFileSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'birth-certificate.pdf' })
  originalName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 12345 })
  sizeBytes!: number;

  @ApiProperty({
    example: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    nullable: true,
  })
  checksumSha256!: string | null;
}

export class ApplicantDocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  requestId!: string;

  @ApiProperty({ example: 'uploaded' })
  status!: ApplicantDocumentApiStatus;

  @ApiProperty({ example: 'Birth certificate' })
  title!: string;

  @ApiProperty({ example: 'Birth certificate' })
  documentType!: string;

  @ApiProperty({
    type: ApplicantDocumentRequiredDocumentSummaryDto,
    nullable: true,
  })
  requiredDocument!: ApplicantDocumentRequiredDocumentSummaryDto | null;

  @ApiProperty({ type: ApplicantDocumentFileSummaryDto })
  file!: ApplicantDocumentFileSummaryDto;

  @ApiProperty({ example: 'Uploaded a scanned copy.', nullable: true })
  notes!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ApplicantDocumentsListResponseDto {
  @ApiProperty({ type: [ApplicantDocumentResponseDto] })
  data!: ApplicantDocumentResponseDto[];
}

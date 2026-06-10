import { ApiProperty } from '@nestjs/swagger';

export class AdmissionRequiredDocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Birth certificate' })
  title!: string;

  @ApiProperty({ example: 'Clear scanned copy', nullable: true })
  description!: string | null;

  @ApiProperty({ example: true })
  isMandatory!: boolean;

  @ApiProperty({
    type: [String],
    example: ['application/pdf', 'image/jpeg', 'image/png'],
  })
  acceptedFileTypes!: string[];

  @ApiProperty({ example: 1 })
  maxFiles!: number;

  @ApiProperty({ example: 10 })
  sortOrder!: number;
}

export class AdmissionRequiredDocumentsListResponseDto {
  @ApiProperty({ type: [AdmissionRequiredDocumentResponseDto] })
  data!: AdmissionRequiredDocumentResponseDto[];
}

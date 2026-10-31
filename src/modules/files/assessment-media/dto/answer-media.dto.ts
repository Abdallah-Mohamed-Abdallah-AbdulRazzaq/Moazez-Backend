import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { File as ManagedFile } from '@prisma/client';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateAnswerUploadDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() clientRequestId!: string;
  @ApiProperty() @IsString() @MaxLength(1024) originalName!: string;
  @ApiProperty() @IsString() @MaxLength(128) expectedMimeType!: string;
  @ApiProperty({ example: '1024' })
  @Matches(/^[1-9][0-9]{0,11}$/u)
  expectedSizeBytes!: string;
}
export class BindAnswerUploadDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() uploadId!: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  replaceAssetId?: string;
}

export class AnswerMediaUploadResponseDto {
  @ApiProperty({ format: 'uuid' }) uploadId!: string;
  @ApiProperty({
    enum: [
      'CREATED',
      'UPLOADING',
      'VERIFYING',
      'READY',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
    ],
  })
  status!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) fileId!: string | null;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'New uploader-only capability; transient, never returned on retry',
  })
  uploadCapability?: object;
}
export class AnswerMediaAssetDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty({ enum: ['MANAGED_FILE'] }) sourceType!: 'MANAGED_FILE';
  @ApiProperty() category!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiPropertyOptional() originalName?: string;
  @ApiPropertyOptional() mimeType?: string;
  @ApiPropertyOptional() sizeBytes?: string;
  @ApiPropertyOptional() previewAllowed?: boolean;
  @ApiPropertyOptional() downloadAllowed?: boolean;
}
export class AnswerMediaAssetResponseDto {
  @ApiProperty({ type: AnswerMediaAssetDto }) asset!: AnswerMediaAssetDto;
}
export class AnswerMediaAssetsResponseDto {
  @ApiProperty({ type: [AnswerMediaAssetDto] }) assets!: AnswerMediaAssetDto[];
}

/** No storage coordinates, claim/evidence material or capability in persistent views. */
export function presentAnswerAsset(asset: {
  id: string;
  fileId: string;
  category: string;
  createdAt: Date;
}) {
  return {
    id: asset.id,
    fileId: asset.fileId,
    sourceType: 'MANAGED_FILE' as const,
    category: asset.category,
    createdAt: asset.createdAt.toISOString(),
  };
}

export interface AnswerAssetView {
  asset: { id: string; fileId: string; category: string; createdAt: Date };
  file: ManagedFile;
  previewAllowed: boolean;
  downloadAllowed: boolean;
}

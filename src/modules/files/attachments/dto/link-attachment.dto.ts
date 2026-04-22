import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { FileVisibility } from '@prisma/client';

export class CreateAttachmentDto {
  @IsUUID()
  fileId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  resourceType!: string;

  @IsUUID()
  resourceId!: string;
}

export class ListAttachmentsQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  resourceType!: string;

  @IsUUID()
  resourceId!: string;
}

export class AttachmentFileSummaryDto {
  id!: string;
  originalName!: string;
  mimeType!: string;
  sizeBytes!: string;
  visibility!: FileVisibility;
}

export class AttachmentResponseDto {
  id!: string;
  fileId!: string;
  resourceType!: string;
  resourceId!: string;
  createdAt!: string;
  file!: AttachmentFileSummaryDto;
}

export class DeleteAttachmentResponseDto {
  ok!: boolean;
}

import { ApiProperty } from '@nestjs/swagger';
import {
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentTargetScopeType,
  AcademicContentType,
  FileUploadSessionStatus,
} from '@prisma/client';

export class AcademicContentResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) academicYearId!: string;
  @ApiProperty({ format: 'uuid' }) termId!: string;
  @ApiProperty({ enum: AcademicContentType }) type!: AcademicContentType;
  @ApiProperty({ enum: AcademicContentAudienceType })
  audience!: AcademicContentAudienceType;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({
    enum: [AcademicContentStatus.DRAFT, AcademicContentStatus.ARCHIVED],
  })
  status!: AcademicContentStatus;
  @ApiProperty({ format: 'date-time', nullable: true })
  archivedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class AcademicContentTargetResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: AcademicContentTargetScopeType })
  scopeType!: AcademicContentTargetScopeType;
  @ApiProperty({ format: 'uuid', nullable: true }) stageId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) gradeId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) sectionId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) classroomId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) subjectId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true })
  teacherSubjectAllocationId!: string | null;
}

export class AcademicContentAssetResponseDto {
  @ApiProperty({ format: 'uuid' }) assetId!: string;
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty() originalName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty({ type: String, description: 'Decimal bytes' })
  sizeBytes!: string;
  @ApiProperty({ minimum: 0 }) sortOrder!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AcademicContentLinkResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ minimum: 0 }) sortOrder!: number;
}

export class AcademicContentTagResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() value!: string;
  @ApiProperty({ minimum: 0 }) sortOrder!: number;
}

export class AcademicContentLinksResponseDto {
  @ApiProperty({ type: () => AcademicContentLinkResponseDto, isArray: true })
  links!: AcademicContentLinkResponseDto[];
}

export class AcademicContentTagsResponseDto {
  @ApiProperty({ type: () => AcademicContentTagResponseDto, isArray: true })
  tags!: AcademicContentTagResponseDto[];
}

export class AcademicContentDetailResponseDto extends AcademicContentResponseDto {
  @ApiProperty({ type: () => AcademicContentTargetResponseDto, isArray: true })
  targets!: AcademicContentTargetResponseDto[];
  @ApiProperty({ type: () => AcademicContentAssetResponseDto, isArray: true })
  assets!: AcademicContentAssetResponseDto[];
  @ApiProperty({ type: () => AcademicContentLinkResponseDto, isArray: true })
  links!: AcademicContentLinkResponseDto[];
  @ApiProperty({ type: () => AcademicContentTagResponseDto, isArray: true })
  tags!: AcademicContentTagResponseDto[];
}

export class AcademicContentListResponseDto {
  @ApiProperty({ type: () => AcademicContentResponseDto, isArray: true })
  items!: AcademicContentResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}

export class AcademicContentTargetsResponseDto {
  @ApiProperty({ type: () => AcademicContentTargetResponseDto, isArray: true })
  targets!: AcademicContentTargetResponseDto[];
}

export class AcademicContentDeleteResponseDto {
  @ApiProperty() ok!: boolean;
}

export class AcademicContentUploadIntentResponseDto {
  @ApiProperty({ format: 'uuid' }) uploadId!: string;
  @ApiProperty({ enum: FileUploadSessionStatus })
  status!: FileUploadSessionStatus;
  @ApiProperty({ description: 'Single-use bearer upload capability' })
  sessionUrl!: string;
  @ApiProperty({ format: 'date-time' }) capabilityExpiresAt!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty() expectedMimeType!: string;
  @ApiProperty({ type: String, description: 'Decimal bytes' })
  expectedSizeBytes!: string;
  @ApiProperty({ enum: ['resumable'] }) uploadMode!: 'resumable';
}

export class AcademicContentCompletedAssetResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) academicContentId!: string;
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AcademicContentCompletedFileResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() originalName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty({ type: String, description: 'Decimal bytes' })
  sizeBytes!: string;
}

export class AcademicContentUploadCompleteResponseDto {
  @ApiProperty({ type: () => AcademicContentCompletedAssetResponseDto })
  asset!: AcademicContentCompletedAssetResponseDto;
  @ApiProperty({ type: () => AcademicContentCompletedFileResponseDto })
  file!: AcademicContentCompletedFileResponseDto;
}

export class AcademicContentUploadCancelResponseDto {
  @ApiProperty({ format: 'uuid' }) uploadId!: string;
  @ApiProperty({ enum: FileUploadSessionStatus })
  status!: FileUploadSessionStatus;
  @ApiProperty({ format: 'date-time', nullable: true })
  cancelledAt!: string | null;
}

export class AcademicContentAssetUnlinkResponseDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty({ format: 'uuid' }) assetId!: string;
}

export class AcademicContentFilePolicyResponseDto {
  @ApiProperty() attachmentsEnabled!: boolean;
  @ApiProperty({ type: String, description: 'Decimal bytes' })
  maximumFileSizeBytes!: string;
  @ApiProperty() documentsEnabled!: boolean;
  @ApiProperty() imagesEnabled!: boolean;
  @ApiProperty() videosEnabled!: boolean;
  @ApiProperty() audioEnabled!: boolean;
  @ApiProperty() archivesEnabled!: boolean;
  @ApiProperty() otherFilesEnabled!: boolean;
  @ApiProperty() allowStudentDownload!: boolean;
  @ApiProperty() allowGuardianDownload!: boolean;
  @ApiProperty() allowInlinePreview!: boolean;
}

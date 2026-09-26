import { ApiProperty } from '@nestjs/swagger';
import {
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentType,
} from '@prisma/client';
import {
  AcademicContentLinkResponseDto,
  AcademicContentTagResponseDto,
  AcademicContentTargetResponseDto,
} from './academic-content-response.dto';

export class AcademicContentRevisionSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ minimum: 1 }) revisionNumber!: number;
  @ApiProperty({ minimum: 1 }) snapshotContractVersion!: number;
  @ApiProperty({ enum: AcademicContentStatus })
  sourceStatus!: AcademicContentStatus;
  @ApiProperty() title!: string;
  @ApiProperty({ format: 'date-time' }) capturedAt!: string;
}

export class AcademicContentRevisionListDto {
  @ApiProperty({ type: () => AcademicContentRevisionSummaryDto, isArray: true })
  items!: AcademicContentRevisionSummaryDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}

export class AcademicContentRevisionAssetDto {
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty({ minimum: 0 }) sortOrder!: number;
  @ApiProperty() originalName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty({ type: String, description: 'Decimal bytes' })
  sizeBytes!: string;
}

export class AcademicContentRevisionDetailDto extends AcademicContentRevisionSummaryDto {
  @ApiProperty({ format: 'uuid' }) academicContentId!: string;
  @ApiProperty({ format: 'uuid' }) academicYearId!: string;
  @ApiProperty({ format: 'uuid' }) termId!: string;
  @ApiProperty({ enum: AcademicContentType }) type!: AcademicContentType;
  @ApiProperty({ enum: AcademicContentAudienceType })
  audience!: AcademicContentAudienceType;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ type: () => AcademicContentTargetResponseDto, isArray: true })
  targets!: AcademicContentTargetResponseDto[];
  @ApiProperty({ type: () => AcademicContentRevisionAssetDto, isArray: true })
  assets!: AcademicContentRevisionAssetDto[];
  @ApiProperty({ type: () => AcademicContentLinkResponseDto, isArray: true })
  links!: AcademicContentLinkResponseDto[];
  @ApiProperty({ type: () => AcademicContentTagResponseDto, isArray: true })
  tags!: AcademicContentTagResponseDto[];
}

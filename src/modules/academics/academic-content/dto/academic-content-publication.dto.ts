import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  AcademicContentPublicationStatus,
  AcademicContentStatus,
} from '@prisma/client';

const publicationInstant =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export class CreateAcademicContentPublicationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientRequestId!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(publicationInstant)
  publishAt?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(publicationInstant)
  visibleFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(publicationInstant)
  visibleUntil?: string | null;
}

export class AcademicContentPublicationHistoryQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class AcademicContentEmptyPublicationBodyDto {
  [key: string]: never;
}

export class AcademicContentPublicationReadinessResponseDto {
  @ApiProperty() canPublish!: boolean;
  @ApiProperty() canSchedule!: boolean;
  @ApiProperty({ type: String, isArray: true }) blockingReasons!: string[];
}

export class AcademicContentAudiencePreviewResponseDto {
  @ApiProperty({ format: 'date-time' }) asOf!: string;
  @ApiProperty({ type: 'integer', minimum: 0 }) students!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) guardianContexts!: number;
  @ApiProperty({ type: 'integer', minimum: 0 })
  guardianUsersWithAccounts!: number;
  @ApiProperty({ type: 'integer', minimum: 0 })
  guardianNotificationOptOutContexts!: number;
}

export class AcademicContentPublicationResponseDto {
  @ApiProperty({ format: 'uuid' }) publicationId!: string;
  @ApiProperty({ format: 'uuid' }) revisionId!: string;
  @ApiProperty({ enum: AcademicContentPublicationStatus })
  status!: AcademicContentPublicationStatus;
  @ApiProperty({ enum: AcademicContentStatus })
  sourceContentStatus!: AcademicContentStatus;
  @ApiProperty({ format: 'date-time' }) publishAt!: string;
  @ApiProperty({ format: 'date-time' }) visibleFrom!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  visibleUntil!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiredAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: string | null;
  @ApiProperty({ type: 'integer', minimum: 0 }) studentRecipientCount!: number;
  @ApiProperty({ type: 'integer', minimum: 0 })
  guardianRecipientContextCount!: number;
  @ApiProperty({ format: 'uuid' }) createdByUserId!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AcademicContentPublicationHistoryResponseDto {
  @ApiProperty({
    type: () => AcademicContentPublicationResponseDto,
    isArray: true,
  })
  items!: AcademicContentPublicationResponseDto[];
  @ApiProperty({ type: 'integer', minimum: 1 }) page!: number;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100 }) limit!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) total!: number;
}

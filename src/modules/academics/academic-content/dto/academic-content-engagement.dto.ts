import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AcademicContentEngagementEventType } from '@prisma/client';
import { IsEnum, IsUUID, ValidateIf } from 'class-validator';

export class RecordAcademicContentEngagementDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientRequestId!: string;

  @ApiProperty({ enum: AcademicContentEngagementEventType })
  @IsEnum(AcademicContentEngagementEventType)
  eventType!: AcademicContentEngagementEventType;

  @ApiProperty({
    format: 'uuid',
    description: 'Optimistic current-publication precondition',
  })
  @IsUUID()
  expectedPublicationId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID()
  fileId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID()
  revisionLinkId?: string;
}

export class AcademicContentEngagementResponseDto {
  @ApiProperty({ format: 'uuid' })
  eventId!: string;
  @ApiProperty({ enum: AcademicContentEngagementEventType })
  eventType!: AcademicContentEngagementEventType;
  @ApiProperty({ format: 'uuid' })
  publicationId!: string;
  @ApiProperty({ format: 'uuid' })
  revisionId!: string;
  @ApiProperty({ format: 'date-time' })
  recordedAt!: string;
}

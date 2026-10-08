import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Used as the strict GET query and POST body. Scope and timestamps are server owned. */
export class AcademicContentAcknowledgementRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  expectedPublicationId!: string;
}

/** POST accepts no query parameters. */
export class AcademicContentAcknowledgementEmptyQueryDto {}

export class AcademicContentAcknowledgementResponseDto {
  @ApiProperty({ format: 'uuid' })
  publicationId!: string;

  @ApiProperty({ format: 'uuid' })
  revisionId!: string;

  @ApiProperty()
  requiresAcknowledgement!: boolean;

  @ApiProperty({ enum: ['NOT_REQUIRED', 'PENDING', 'ACKNOWLEDGED'] })
  status!: 'NOT_REQUIRED' | 'PENDING' | 'ACKNOWLEDGED';

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  acknowledgementId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  acknowledgedAt!: string | null;
}

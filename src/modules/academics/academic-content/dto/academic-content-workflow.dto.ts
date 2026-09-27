import { ApiProperty } from '@nestjs/swagger';
import {
  AcademicContentApprovalStatus,
  AcademicContentStatus,
} from '@prisma/client';
import { IsString } from 'class-validator';

export class AcademicContentRequestChangesDto {
  @ApiProperty({ type: String, maxLength: 4000 })
  @IsString()
  note!: string;
}

export class AcademicContentTransitionResponseDto {
  @ApiProperty({ format: 'uuid' })
  contentId!: string;

  @ApiProperty({ enum: AcademicContentStatus })
  contentStatus!: AcademicContentStatus;

  @ApiProperty({ format: 'uuid' })
  approvalId!: string;

  @ApiProperty({ enum: AcademicContentApprovalStatus })
  approvalStatus!: AcademicContentApprovalStatus;

  @ApiProperty({ format: 'uuid' })
  revisionId!: string;

  @ApiProperty({ type: Number })
  roundNumber!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  submittedAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt!: Date | null;
}

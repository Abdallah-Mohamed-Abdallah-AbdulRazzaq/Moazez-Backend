import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  AcademicContentApprovalStatus,
  AcademicContentTargetScopeType,
} from '@prisma/client';
import { AcademicContentPaginationQueryDto } from './academic-content-request.dto';

export class AcademicContentReviewQueueQueryDto extends AcademicContentPaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  termId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  teacherUserId?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class AcademicContentReviewQueueTargetDto {
  @ApiProperty({ enum: AcademicContentTargetScopeType })
  scopeType!: AcademicContentTargetScopeType;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  stageId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  gradeId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sectionId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  classroomId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  subjectId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  teacherSubjectAllocationId!: string | null;
}

export class AcademicContentReviewQueueItemDto {
  @ApiProperty({ format: 'uuid' }) contentId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ format: 'uuid' }) academicYearId!: string;
  @ApiProperty({ format: 'uuid' }) termId!: string;
  @ApiProperty({ format: 'uuid' }) approvalId!: string;
  @ApiProperty({ format: 'uuid' }) submittedRevisionId!: string;
  @ApiProperty({ minimum: 1 }) roundNumber!: number;
  @ApiProperty({ format: 'date-time' }) submittedAt!: string;
  @ApiProperty({ format: 'uuid' }) submittedByUserId!: string;
  @ApiProperty({
    type: () => AcademicContentReviewQueueTargetDto,
    isArray: true,
  })
  @Type(() => AcademicContentReviewQueueTargetDto)
  targets!: AcademicContentReviewQueueTargetDto[];
}

export class AcademicContentReviewQueueResponseDto {
  @ApiProperty({ type: () => AcademicContentReviewQueueItemDto, isArray: true })
  items!: AcademicContentReviewQueueItemDto[];
  @ApiProperty({ minimum: 1 }) page!: number;
  @ApiProperty({ minimum: 1, maximum: 100 }) limit!: number;
  @ApiProperty({ minimum: 0 }) total!: number;
}

export class AcademicContentApprovalHistoryItemDto {
  @ApiProperty({ format: 'uuid' }) approvalId!: string;
  @ApiProperty({ format: 'uuid' }) revisionId!: string;
  @ApiProperty({ minimum: 1 }) roundNumber!: number;
  @ApiProperty({ enum: AcademicContentApprovalStatus })
  status!: AcademicContentApprovalStatus;
  @ApiProperty({ format: 'uuid' }) submittedByUserId!: string;
  @ApiProperty({ format: 'date-time' }) submittedAt!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  decidedByUserId!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) decisionNote!: string | null;
}

export class AcademicContentApprovalHistoryResponseDto {
  @ApiProperty({
    type: () => AcademicContentApprovalHistoryItemDto,
    isArray: true,
  })
  items!: AcademicContentApprovalHistoryItemDto[];
  @ApiProperty({ minimum: 1 }) page!: number;
  @ApiProperty({ minimum: 1, maximum: 100 }) limit!: number;
  @ApiProperty({ minimum: 0 }) total!: number;
}

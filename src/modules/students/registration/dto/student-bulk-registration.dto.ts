import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  Allow,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class StudentBulkRegistrationPlacementDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  academicYearId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  termId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  classroomId!: string;

  @ApiProperty({ example: '2026-09-01', format: 'date' })
  @IsDateString()
  enrollmentDate!: string;
}

export class CreateStudentBulkRegistrationDto extends StudentBulkRegistrationPlacementDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  @Allow()
  file?: unknown;
}

export class StudentBulkRegistrationNamedPlacementDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  nameAr!: string;

  @ApiProperty()
  nameEn!: string;
}

export class StudentBulkRegistrationClassroomPlacementDto extends StudentBulkRegistrationNamedPlacementDto {
  @ApiProperty({ nullable: true, type: Number })
  capacity!: number | null;
}

export class StudentBulkRegistrationResolvedPlacementDto {
  @ApiProperty({ type: StudentBulkRegistrationNamedPlacementDto })
  academicYear!: StudentBulkRegistrationNamedPlacementDto;

  @ApiPropertyOptional({
    type: StudentBulkRegistrationNamedPlacementDto,
    nullable: true,
  })
  term!: StudentBulkRegistrationNamedPlacementDto | null;

  @ApiProperty({ type: StudentBulkRegistrationNamedPlacementDto })
  stage!: StudentBulkRegistrationNamedPlacementDto;

  @ApiProperty({ type: StudentBulkRegistrationNamedPlacementDto })
  grade!: StudentBulkRegistrationNamedPlacementDto;

  @ApiProperty({ type: StudentBulkRegistrationNamedPlacementDto })
  section!: StudentBulkRegistrationNamedPlacementDto;

  @ApiProperty({ type: StudentBulkRegistrationClassroomPlacementDto })
  classroom!: StudentBulkRegistrationClassroomPlacementDto;

  @ApiProperty({ format: 'date' })
  enrollmentDate!: string;
}

export class StudentBulkRegistrationSeatReadinessDto {
  @ApiProperty({ nullable: true, type: Number })
  limit!: number | null;

  @ApiProperty()
  used!: number;

  @ApiProperty({ nullable: true, type: Number })
  remaining!: number | null;
}

export class StudentBulkRegistrationPreflightResponseDto {
  @ApiProperty()
  valid!: boolean;

  @ApiProperty({ type: [String] })
  errors!: string[];

  @ApiProperty()
  templateVersion!: number;

  @ApiPropertyOptional({
    type: StudentBulkRegistrationResolvedPlacementDto,
    nullable: true,
  })
  placement!: StudentBulkRegistrationResolvedPlacementDto | null;

  @ApiPropertyOptional({
    type: StudentBulkRegistrationSeatReadinessDto,
    nullable: true,
  })
  studentSeat!: StudentBulkRegistrationSeatReadinessDto | null;
}

export class StudentBulkRegistrationBatchPlacementResponseDto {
  @ApiProperty({ format: 'uuid' })
  academicYearId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  termId!: string | null;

  @ApiProperty({ format: 'uuid' })
  classroomId!: string;

  @ApiProperty({ format: 'date' })
  enrollmentDate!: string;
}

export class StudentBulkRegistrationBatchCountersResponseDto {
  @ApiProperty()
  totalRows!: number;

  @ApiProperty()
  validRows!: number;

  @ApiProperty()
  invalidRows!: number;

  @ApiProperty()
  createdRows!: number;

  @ApiProperty()
  failedRows!: number;
}

export class StudentBulkRegistrationBatchResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  sourceImportJobId!: string;

  @ApiProperty({ enum: StudentBulkRegistrationBatchStatus })
  status!: StudentBulkRegistrationBatchStatus;

  @ApiProperty()
  templateVersion!: number;

  @ApiProperty({ type: StudentBulkRegistrationBatchPlacementResponseDto })
  placement!: StudentBulkRegistrationBatchPlacementResponseDto;

  @ApiProperty({ type: StudentBulkRegistrationBatchCountersResponseDto })
  counters!: StudentBulkRegistrationBatchCountersResponseDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class StudentBulkRegistrationBatchDetailResponseDto extends StudentBulkRegistrationBatchResponseDto {
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  validatedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  completedAt!: string | null;

  @ApiProperty({ type: [String] })
  validationErrors!: string[];
}

export class ListStudentBulkRegistrationRowsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;

  @ApiPropertyOptional({ enum: StudentBulkRegistrationRowStatus })
  @IsOptional()
  @IsEnum(StudentBulkRegistrationRowStatus)
  status?: StudentBulkRegistrationRowStatus;
}

export class StudentBulkRegistrationNormalizedDataResponseDto {
  @ApiPropertyOptional({ nullable: true }) firstNameEn!: string | null;
  @ApiPropertyOptional({ nullable: true }) fatherNameEn!: string | null;
  @ApiPropertyOptional({ nullable: true }) grandfatherNameEn!: string | null;
  @ApiPropertyOptional({ nullable: true }) familyNameEn!: string | null;
  @ApiPropertyOptional({ nullable: true }) firstNameAr!: string | null;
  @ApiPropertyOptional({ nullable: true }) fatherNameAr!: string | null;
  @ApiPropertyOptional({ nullable: true }) grandfatherNameAr!: string | null;
  @ApiPropertyOptional({ nullable: true }) familyNameAr!: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'date' }) dateOfBirth!:
    | string
    | null;
  @ApiPropertyOptional({ nullable: true }) gender!: string | null;
  @ApiPropertyOptional({ nullable: true }) nationality!: string | null;
  @ApiProperty() username!: string;
  @ApiPropertyOptional({ nullable: true }) contactEmail!: string | null;
  @ApiPropertyOptional({ nullable: true }) studentPhone!: string | null;
}

export class StudentBulkRegistrationRowErrorResponseDto {
  @ApiProperty() code!: string;
  @ApiPropertyOptional({ nullable: true }) field!: string | null;
  @ApiPropertyOptional() reason?: string;
}

export class StudentBulkRegistrationRowResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() rowNumber!: number;
  @ApiProperty({ enum: StudentBulkRegistrationRowStatus })
  status!: StudentBulkRegistrationRowStatus;
  @ApiProperty({ type: StudentBulkRegistrationNormalizedDataResponseDto })
  normalizedData!: StudentBulkRegistrationNormalizedDataResponseDto;
  @ApiProperty({ type: [StudentBulkRegistrationRowErrorResponseDto] })
  errors!: StudentBulkRegistrationRowErrorResponseDto[];
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) studentId!:
    | string
    | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) userId!:
    | string
    | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) enrollmentId!:
    | string
    | null;
}

export class StudentBulkRegistrationRowsResponseDto {
  @ApiProperty({ type: [StudentBulkRegistrationRowResponseDto] })
  items!: StudentBulkRegistrationRowResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

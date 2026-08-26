import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StudentBulkRegistrationBatchStatus } from '@prisma/client';
import { Allow, IsDateString, IsOptional, IsUUID } from 'class-validator';

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

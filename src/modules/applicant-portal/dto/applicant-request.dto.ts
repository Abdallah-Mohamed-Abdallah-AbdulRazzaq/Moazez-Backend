import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { APPLICANT_REQUEST_STATUS_FILTERS } from '../domain/applicant-request.inputs';

export type ApplicantRequestApiStatus =
  | 'draft'
  | 'needs_action'
  | 'submitted'
  | 'under_review'
  | 'waitlisted'
  | 'accepted'
  | 'rejected';

export class CreateApplicantRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  schoolId!: string;

  @ApiProperty({ example: 'Layla', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  childFirstName!: string;

  @ApiPropertyOptional({ example: 'Hassan', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  childLastName?: string;

  @ApiPropertyOptional({ example: '2018-04-12', format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  childDateOfBirth?: string;

  @ApiPropertyOptional({ example: 'female', maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  childGender?: string;

  @ApiPropertyOptional({ example: 'Egyptian', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  childNationality?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  requestedAcademicYearId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  requestedGradeId?: string;

  @ApiPropertyOptional({ example: 'ABC School', maxLength: 180 })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  previousSchool?: string;

  @ApiPropertyOptional({ example: 'Needs bus route info.', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ListApplicantRequestsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Values above 100 are clamped to 100.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit = 20;

  @ApiPropertyOptional({
    enum: APPLICANT_REQUEST_STATUS_FILTERS,
    example: 'draft',
  })
  @IsOptional()
  @IsString()
  @IsIn(APPLICANT_REQUEST_STATUS_FILTERS)
  status?: string;
}

export class ApplicantRequestSchoolSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Moazez Academy' })
  name!: string;

  @ApiProperty({ example: 'Moazez', nullable: true })
  shortName!: string | null;

  @ApiProperty({ example: 'Cairo', nullable: true })
  city!: string | null;

  @ApiProperty({ example: 'Egypt', nullable: true })
  country!: string | null;
}

export class ApplicantRequestAcademicLabelDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Grade 4' })
  label!: string;
}

export class ApplicantRequestChildDetailsDto {
  @ApiProperty({ example: 'Layla' })
  firstName!: string;

  @ApiProperty({ example: 'Hassan', nullable: true })
  lastName!: string | null;

  @ApiProperty({ example: 'Layla Hassan' })
  fullName!: string;

  @ApiProperty({ example: '2018-04-12', nullable: true, format: 'date' })
  dateOfBirth!: string | null;

  @ApiProperty({ example: 'female', nullable: true })
  gender!: string | null;

  @ApiProperty({ example: 'Egyptian', nullable: true })
  nationality!: string | null;
}

export class ApplicantRequestCardResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: APPLICANT_REQUEST_STATUS_FILTERS, example: 'draft' })
  status!: ApplicantRequestApiStatus;

  @ApiProperty({ type: ApplicantRequestSchoolSummaryDto })
  school!: ApplicantRequestSchoolSummaryDto;

  @ApiProperty({ example: 'Layla Hassan' })
  childFullName!: string;

  @ApiProperty({ type: ApplicantRequestAcademicLabelDto, nullable: true })
  requestedAcademicYear!: ApplicantRequestAcademicLabelDto | null;

  @ApiProperty({ type: ApplicantRequestAcademicLabelDto, nullable: true })
  requestedGrade!: ApplicantRequestAcademicLabelDto | null;

  @ApiProperty({ example: 2 })
  missingItemsCount!: number;

  @ApiProperty({ example: 25 })
  progressValue!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ApplicantRequestDetailResponseDto extends ApplicantRequestCardResponseDto {
  @ApiProperty({ type: ApplicantRequestChildDetailsDto })
  child!: ApplicantRequestChildDetailsDto;

  @ApiProperty({ example: 'ABC School', nullable: true })
  previousSchool!: string | null;

  @ApiProperty({ example: 'Needs bus route info.', nullable: true })
  notes!: string | null;
}

export class ApplicantRequestsMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;
}

export class ApplicantRequestsListResponseDto {
  @ApiProperty({ type: [ApplicantRequestCardResponseDto] })
  data!: ApplicantRequestCardResponseDto[];

  @ApiProperty({ type: ApplicantRequestsMetaDto })
  meta!: ApplicantRequestsMetaDto;
}

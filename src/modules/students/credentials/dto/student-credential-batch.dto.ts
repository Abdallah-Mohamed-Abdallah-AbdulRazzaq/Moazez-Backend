import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import {
  STUDENT_CREDENTIAL_AUDIENCE_API_VALUES,
  STUDENT_CREDENTIAL_MODE_API_VALUES,
  type StudentCredentialAudienceApiValue,
  type StudentCredentialModeApiValue,
} from '../domain/student-credential.types';

export class StudentCredentialAudienceDto {
  @ApiProperty({ enum: STUDENT_CREDENTIAL_AUDIENCE_API_VALUES })
  @Allow()
  audienceMode!: unknown;

  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  sourceRegistrationBatchId?: unknown;
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @Allow()
  studentIds?: unknown;
  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  academicYearId?: unknown;
  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  stageId?: unknown;
  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  gradeId?: unknown;
  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  sectionId?: unknown;
  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  classroomId?: unknown;
}

export class CreateStudentCredentialBatchDto extends StudentCredentialAudienceDto {
  @ApiProperty({ enum: STUDENT_CREDENTIAL_MODE_API_VALUES })
  @Allow()
  credentialMode!: unknown;
}

export class StudentCredentialPreviewSampleItemDto {
  @ApiProperty({ format: 'uuid' }) studentId!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() fullName!: string;
  @ApiPropertyOptional({ nullable: true }) username!: string | null;
  @ApiProperty() loginEmail!: string;
  @ApiProperty() hasPassword!: boolean;
  @ApiProperty() mustChangePassword!: boolean;
  @ApiProperty() credentialVersion!: number;
}

export class StudentCredentialBatchPreviewResponseDto {
  @ApiProperty() totalMatched!: number;
  @ApiProperty() eligible!: number;
  @ApiProperty() skipped!: number;
  @ApiProperty({ additionalProperties: { type: 'number' } })
  skippedReasons!: Record<string, number>;
  @ApiProperty({ type: [StudentCredentialPreviewSampleItemDto] })
  sample!: StudentCredentialPreviewSampleItemDto[];
}

export class StudentCredentialBatchCountersDto {
  @ApiProperty() totalRows!: number;
  @ApiProperty() generatedRows!: number;
  @ApiProperty() skippedRows!: number;
  @ApiProperty() failedRows!: number;
}

export class StudentCredentialBatchResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: STUDENT_CREDENTIAL_AUDIENCE_API_VALUES })
  audienceMode!: StudentCredentialAudienceApiValue;
  @ApiProperty({ enum: STUDENT_CREDENTIAL_MODE_API_VALUES })
  credentialMode!: StudentCredentialModeApiValue;
  @ApiProperty({ additionalProperties: { type: 'string', format: 'uuid' } })
  selectors!: Record<string, string>;
  @ApiProperty() status!: string;
  @ApiProperty({ type: StudentCredentialBatchCountersDto })
  counters!: StudentCredentialBatchCountersDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  startedAt!: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  completedAt!: string | null;
}

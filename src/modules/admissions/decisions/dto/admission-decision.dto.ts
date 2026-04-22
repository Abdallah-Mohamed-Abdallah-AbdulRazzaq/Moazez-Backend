import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApplicationStatusApiValue } from '../../applications/domain/application.enums';
import {
  ADMISSION_DECISION_API_VALUES,
  type AdmissionDecisionApiValue,
} from '../domain/admission-decision.enums';

export class ListAdmissionDecisionsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(ADMISSION_DECISION_API_VALUES)
  decision?: AdmissionDecisionApiValue;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class CreateAdmissionDecisionDto {
  @IsUUID()
  applicationId!: string;

  @IsIn(ADMISSION_DECISION_API_VALUES)
  decision!: AdmissionDecisionApiValue;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class AdmissionDecisionResponseDto {
  id!: string;
  applicationId!: string;
  studentName!: string;
  decision!: AdmissionDecisionApiValue;
  reason!: string | null;
  decidedByUserId!: string;
  decidedByName!: string;
  decidedAt!: string;
  applicationStatus!: ApplicationStatusApiValue;
  createdAt!: string;
  updatedAt!: string;
}

export class AdmissionDecisionsListResponseDto {
  items!: AdmissionDecisionResponseDto[];
  pagination!: {
    page: number;
    limit: number;
    total: number;
  };
}

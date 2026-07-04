import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PublicDismissalGateStatus } from '../../shared/dismissal.types';

export class ListDismissalStaffAssignmentsQueryDto {
  @IsOptional()
  @IsUUID()
  staffUserId?: string;

  @IsOptional()
  @IsUUID()
  gateId?: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  active?: string | boolean;

  @IsOptional()
  lead?: string | boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateDismissalStaffAssignmentDto {
  @IsUUID()
  staffUserId!: string;

  @IsOptional()
  @IsUUID()
  gateId?: string | null;

  @IsOptional()
  @IsUUID()
  stageId?: string | null;

  @IsOptional()
  @IsUUID()
  gradeId?: string | null;

  @IsOptional()
  @IsUUID()
  sectionId?: string | null;

  @IsOptional()
  @IsUUID()
  classroomId?: string | null;

  @IsOptional()
  @IsBoolean()
  isLead?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

export class UpdateDismissalStaffAssignmentDto {
  @IsOptional()
  @IsUUID()
  staffUserId?: string;

  @IsOptional()
  @IsUUID()
  gateId?: string | null;

  @IsOptional()
  @IsUUID()
  stageId?: string | null;

  @IsOptional()
  @IsUUID()
  gradeId?: string | null;

  @IsOptional()
  @IsUUID()
  sectionId?: string | null;

  @IsOptional()
  @IsUUID()
  classroomId?: string | null;

  @IsOptional()
  @IsBoolean()
  isLead?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

export class DismissalStaffSummaryDto {
  displayName!: string;
  email!: string | null;
  userType!: 'dismissal_staff';
  status!: 'active' | 'inactive' | 'suspended';
}

export class DismissalStaffAssignmentGateDto {
  id!: string;
  code!: string;
  name!: string;
  status!: PublicDismissalGateStatus;
}

export class DismissalAcademicNodeDto {
  id!: string;
  name!: string;
}

export class DismissalAcademicScopeDto {
  stage!: DismissalAcademicNodeDto | null;
  grade!: DismissalAcademicNodeDto | null;
  section!: DismissalAcademicNodeDto | null;
  classroom!: DismissalAcademicNodeDto | null;
}

export class DismissalStaffAssignmentResponseDto {
  id!: string;
  staff!: DismissalStaffSummaryDto;
  gate!: DismissalStaffAssignmentGateDto | null;
  academicScope!: DismissalAcademicScopeDto;
  isLead!: boolean;
  isActive!: boolean;
  startsAt!: string | null;
  endsAt!: string | null;
  notes!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class DismissalStaffAssignmentsSummaryDto {
  totalCount!: number;
  activeCount!: number;
  inactiveCount!: number;
  leadCount!: number;
}

export class DismissalStaffAssignmentsListResponseDto {
  data!: DismissalStaffAssignmentResponseDto[];
  summary!: DismissalStaffAssignmentsSummaryDto;
}

export class DeleteDismissalStaffAssignmentResponseDto {
  id!: string;
  deleted!: boolean;
}

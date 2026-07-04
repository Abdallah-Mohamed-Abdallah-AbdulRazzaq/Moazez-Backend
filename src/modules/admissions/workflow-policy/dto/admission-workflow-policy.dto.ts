import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

const ADMISSION_WORKFLOW_POLICY_SOURCE_VALUES = [
  'default',
  'school_override',
] as const;

export type AdmissionWorkflowPolicySource = 'default' | 'school_override';

export class UpdateAdmissionWorkflowPolicyDto {
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  requiresPlacementTest?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  requiresInterview?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  allowDirectAcceptance?: boolean;
}

export class AdmissionWorkflowPolicyResponseDto {
  @ApiProperty({ example: true })
  requiresPlacementTest!: boolean;

  @ApiProperty({ example: true })
  requiresInterview!: boolean;

  @ApiProperty({ example: false })
  allowDirectAcceptance!: boolean;

  @ApiProperty({
    enum: ADMISSION_WORKFLOW_POLICY_SOURCE_VALUES,
    example: 'default',
  })
  source!: AdmissionWorkflowPolicySource;

  @ApiProperty({ format: 'date-time', nullable: true })
  updatedAt!: string | null;
}

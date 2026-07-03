import { IsBoolean, IsOptional } from 'class-validator';

export type AdmissionWorkflowPolicySource = 'default' | 'school_override';

export class UpdateAdmissionWorkflowPolicyDto {
  @IsOptional()
  @IsBoolean()
  requiresPlacementTest?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresInterview?: boolean;

  @IsOptional()
  @IsBoolean()
  allowDirectAcceptance?: boolean;
}

export class AdmissionWorkflowPolicyResponseDto {
  requiresPlacementTest!: boolean;
  requiresInterview!: boolean;
  allowDirectAcceptance!: boolean;
  source!: AdmissionWorkflowPolicySource;
  updatedAt!: string | null;
}

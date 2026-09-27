import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAcademicContentWorkflowPolicyDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  preparationApprovalRequired?: boolean;
}

export class AcademicContentWorkflowPolicyResponseDto {
  @ApiProperty({ type: Boolean })
  preparationApprovalRequired!: boolean;
}

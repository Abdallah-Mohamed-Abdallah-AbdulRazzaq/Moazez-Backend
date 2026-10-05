import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PickType,
} from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { ListAcademicContentQueryDto } from '../../../academics/academic-content/dto/academic-content-request.dto';
import {
  AcademicContentDetailResponseDto,
  AcademicContentFilePolicyResponseDto,
} from '../../../academics/academic-content/dto/academic-content-response.dto';

export class ListTeacherAcademicContentQueryDto extends PickType(
  ListAcademicContentQueryDto,
  [
    'type',
    'status',
    'audience',
    'search',
    'tag',
    'weeklyDateFrom',
    'weeklyDateTo',
    'sessionStartAtFrom',
    'sessionStartAtTo',
    'sessionPlatform',
    'guardianPriority',
    'page',
    'limit',
  ] as const,
) {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Currently owned TeacherSubjectAllocation.id',
  })
  @IsOptional()
  @IsUUID()
  classId?: string;
}

export class TeacherAcademicContentActionsDto {
  @ApiProperty() canEdit!: boolean;
  @ApiProperty() canSubmit!: boolean;
  @ApiProperty() canPublish!: boolean;
  @ApiProperty() canUnschedule!: boolean;
  @ApiProperty() canCancelPublication!: boolean;
  @ApiProperty() canStartRevision!: boolean;
}

export class TeacherAcademicContentDetailDto extends AcademicContentDetailResponseDto {
  @ApiProperty({ type: () => TeacherAcademicContentActionsDto })
  capabilities!: TeacherAcademicContentActionsDto;
}

export class TeacherAcademicContentFilesDto extends OmitType(
  AcademicContentFilePolicyResponseDto,
  ['allowStudentDownload', 'allowGuardianDownload'] as const,
) {}

export class TeacherAcademicContentWorkflowDto {
  @ApiProperty() preparationApprovalRequired!: boolean;
}

export class TeacherAcademicContentCapabilitiesDto {
  @ApiProperty({ type: () => TeacherAcademicContentWorkflowDto })
  workflow!: TeacherAcademicContentWorkflowDto;
  @ApiProperty({ type: () => TeacherAcademicContentFilesDto })
  files!: TeacherAcademicContentFilesDto;
}

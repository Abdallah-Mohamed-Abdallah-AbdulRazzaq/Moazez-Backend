import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class GetEffectiveGradeRuleQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsString()
  @MaxLength(32)
  scopeType!: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string;

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
  @IsUUID()
  subjectId?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  AcademicGuardianNotePriority,
  AcademicOnlineSessionPlatform,
  AcademicSubjectResourceCategory,
} from '@prisma/client';

const optionalId = { format: 'uuid', nullable: true } as const;
const optionalText = { nullable: true } as const;

export class ReplaceAcademicContentPreparationDetailDto {
  @ApiPropertyOptional(optionalText) @IsOptional() @IsString() topic?:
    | string
    | null;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  objectives!: string[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  learningOutcomes!: string[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  teachingStrategies!: string[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  activities!: string[];
  @ApiPropertyOptional(optionalText) @IsOptional() @IsString() resourceNotes?:
    | string
    | null;
  @ApiPropertyOptional(optionalText)
  @IsOptional()
  @IsString()
  assessmentNotes?: string | null;
  @ApiPropertyOptional(optionalText) @IsOptional() @IsString() teacherNotes?:
    | string
    | null;
  @ApiPropertyOptional(optionalId) @IsOptional() @IsUUID() curriculumId?:
    | string
    | null;
  @ApiPropertyOptional(optionalId) @IsOptional() @IsUUID() curriculumUnitId?:
    | string
    | null;
  @ApiPropertyOptional(optionalId) @IsOptional() @IsUUID() curriculumLessonId?:
    | string
    | null;
  @ApiPropertyOptional(optionalId) @IsOptional() @IsUUID() lessonPlanId?:
    | string
    | null;
  @ApiPropertyOptional(optionalId) @IsOptional() @IsUUID() lessonPlanItemId?:
    | string
    | null;
  @ApiPropertyOptional(optionalId) @IsOptional() @IsUUID() timetableEntryId?:
    | string
    | null;
}

export class ReplaceAcademicContentWeeklyPlanDetailDto {
  @ApiProperty({ format: 'date' }) @IsString() weekStartDate!: string;
  @ApiProperty({ format: 'date' }) @IsString() weekEndDate!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  objectives!: string[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  topics!: string[];
  @ApiPropertyOptional(optionalText)
  @IsOptional()
  @IsString()
  expectedHomework?: string | null;
  @ApiPropertyOptional(optionalText)
  @IsOptional()
  @IsString()
  upcomingAssessments?: string | null;
  @ApiPropertyOptional(optionalText) @IsOptional() @IsString() notes?:
    | string
    | null;
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @IsUUID('all', { each: true })
  homeworkAssignmentIds!: string[];
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @IsUUID('all', { each: true })
  gradeAssessmentIds!: string[];
}

export class ReplaceAcademicContentGuardianNoteDetailDto {
  @ApiProperty() @IsString() body!: string;
  @ApiProperty({ enum: AcademicGuardianNotePriority })
  @IsEnum(AcademicGuardianNotePriority)
  priority!: AcademicGuardianNotePriority;
  @ApiProperty() @IsBoolean() requiresAcknowledgement!: boolean;
}

export class ReplaceAcademicContentSubjectResourceDetailDto {
  @ApiProperty({ enum: AcademicSubjectResourceCategory })
  @IsEnum(AcademicSubjectResourceCategory)
  resourceCategory!: AcademicSubjectResourceCategory;
  @ApiPropertyOptional(optionalId) @IsOptional() @IsUUID() curriculumId?:
    | string
    | null;
  @ApiPropertyOptional(optionalId) @IsOptional() @IsUUID() curriculumUnitId?:
    | string
    | null;
  @ApiPropertyOptional(optionalId) @IsOptional() @IsUUID() curriculumLessonId?:
    | string
    | null;
}

export class ReplaceAcademicContentOnlineSessionDetailDto {
  @ApiProperty({ enum: AcademicOnlineSessionPlatform })
  @IsEnum(AcademicOnlineSessionPlatform)
  platform!: AcademicOnlineSessionPlatform;
  @ApiPropertyOptional(optionalText) @IsOptional() @IsString() providerName?:
    | string
    | null;
  @ApiProperty() @IsString() joinUrl!: string;
  @ApiPropertyOptional(optionalText) @IsOptional() @IsString() accessCode?:
    | string
    | null;
  @ApiPropertyOptional(optionalText) @IsOptional() @IsString() instructions?:
    | string
    | null;
  @ApiProperty({ format: 'date-time' }) @IsString() startAt!: string;
  @ApiProperty({ format: 'date-time' }) @IsString() endAt!: string;
  @ApiProperty() @IsString() timezone!: string;
  @ApiPropertyOptional(optionalId) @IsOptional() @IsUUID() timetableEntryId?:
    | string
    | null;
}

export class AcademicContentPreparationDetailResponseDto {
  @ApiProperty({ nullable: true }) topic!: string | null;
  @ApiProperty({ type: [String] }) objectives!: string[];
  @ApiProperty({ type: [String] }) learningOutcomes!: string[];
  @ApiProperty({ type: [String] }) teachingStrategies!: string[];
  @ApiProperty({ type: [String] }) activities!: string[];
  @ApiProperty({ nullable: true }) resourceNotes!: string | null;
  @ApiProperty({ nullable: true }) assessmentNotes!: string | null;
  @ApiProperty({ nullable: true }) teacherNotes!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) curriculumId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) curriculumUnitId!:
    | string
    | null;
  @ApiProperty({ format: 'uuid', nullable: true }) curriculumLessonId!:
    | string
    | null;
  @ApiProperty({ format: 'uuid', nullable: true }) lessonPlanId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) lessonPlanItemId!:
    | string
    | null;
  @ApiProperty({ format: 'uuid', nullable: true }) timetableEntryId!:
    | string
    | null;
}

export class AcademicContentWeeklyPlanDetailResponseDto {
  @ApiProperty({ format: 'date' }) weekStartDate!: string;
  @ApiProperty({ format: 'date' }) weekEndDate!: string;
  @ApiProperty({ type: [String] }) objectives!: string[];
  @ApiProperty({ type: [String] }) topics!: string[];
  @ApiProperty({ nullable: true }) expectedHomework!: string | null;
  @ApiProperty({ nullable: true }) upcomingAssessments!: string | null;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ type: [String], format: 'uuid' })
  homeworkAssignmentIds!: string[];
  @ApiProperty({ type: [String], format: 'uuid' })
  gradeAssessmentIds!: string[];
}

export class AcademicContentGuardianNoteDetailResponseDto {
  @ApiProperty() body!: string;
  @ApiProperty({ enum: AcademicGuardianNotePriority })
  priority!: AcademicGuardianNotePriority;
  @ApiProperty() requiresAcknowledgement!: boolean;
}

export class AcademicContentSubjectResourceDetailResponseDto {
  @ApiProperty({ enum: AcademicSubjectResourceCategory })
  resourceCategory!: AcademicSubjectResourceCategory;
  @ApiProperty({ format: 'uuid', nullable: true }) curriculumId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) curriculumUnitId!:
    | string
    | null;
  @ApiProperty({ format: 'uuid', nullable: true }) curriculumLessonId!:
    | string
    | null;
}

export class AcademicContentOnlineSessionDetailResponseDto {
  @ApiProperty({ enum: AcademicOnlineSessionPlatform })
  platform!: AcademicOnlineSessionPlatform;
  @ApiProperty({ nullable: true }) providerName!: string | null;
  @ApiProperty() joinUrl!: string;
  @ApiProperty({ nullable: true }) accessCode!: string | null;
  @ApiProperty({ nullable: true }) instructions!: string | null;
  @ApiProperty({ format: 'date-time' }) startAt!: string;
  @ApiProperty({ format: 'date-time' }) endAt!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) timetableEntryId!:
    | string
    | null;
}

export type AcademicContentTypeDetailResponseDto =
  | AcademicContentPreparationDetailResponseDto
  | AcademicContentWeeklyPlanDetailResponseDto
  | AcademicContentGuardianNoteDetailResponseDto
  | AcademicContentSubjectResourceDetailResponseDto
  | AcademicContentOnlineSessionDetailResponseDto;

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';

export class ListTeacherAllocationsQueryDto {
  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;
}

export class CreateTeacherAllocationDto {
  @IsUUID()
  teacherUserId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  classroomId!: string;

  @IsUUID()
  termId!: string;
}

export class PreviewTeacherAllocationReassignmentDto {
  @IsUUID()
  newTeacherUserId!: string;
}

export class ReassignTeacherAllocationDto {
  @IsUUID()
  newTeacherUserId!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/u)
  impactFingerprint!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,63}$/u)
  reasonCode?: string;
}

export class BulkSaveTeacherAllocationItemDto {
  @IsUUID()
  teacherUserId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  classroomId!: string;
}

export class BulkSaveTeacherAllocationsDto {
  @IsUUID()
  termId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkSaveTeacherAllocationItemDto)
  items!: BulkSaveTeacherAllocationItemDto[];
}

export class ApplyTeacherAllocationToGradeDto {
  @IsUUID()
  termId!: string;

  @IsUUID()
  gradeId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  teacherUserId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  classroomIds?: string[];
}

export class ClearTeacherAllocationsBySubjectDto {
  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsUUID()
  subjectId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  classroomIds?: string[];
}

export class ValidateTeacherAllocationsQueryDto {
  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

export class TeacherLoadsQueryDto {
  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsUUID()
  teacherUserId?: string;
}

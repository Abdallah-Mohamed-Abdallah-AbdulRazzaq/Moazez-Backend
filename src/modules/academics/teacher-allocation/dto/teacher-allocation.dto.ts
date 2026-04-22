import { IsOptional, IsUUID } from 'class-validator';

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

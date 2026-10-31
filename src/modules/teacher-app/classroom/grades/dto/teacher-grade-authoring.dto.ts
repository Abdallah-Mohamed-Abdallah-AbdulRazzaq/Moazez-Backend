import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';
import { UpdateGradeAssessmentQuestionDto } from '../../../../grades/assessments/dto/grade-assessment-question.dto';
import { TeacherClassroomAssessmentParamsDto } from './teacher-classroom-grades.dto';

export class UpdateTeacherGradeQuestionDto extends UpdateGradeAssessmentQuestionDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Exact last-read question revision; stale edits conflict',
  })
  @IsDateString()
  expectedQuestionUpdatedAt!: string;
}
export class TeacherGradeAuthoringQuestionParamsDto extends TeacherClassroomAssessmentParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() questionId!: string;
}
export class TeacherGradeAuthoringGroupParamsDto extends TeacherClassroomAssessmentParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() groupId!: string;
}
export class TeacherGradeAuthoringQuestionAssetParamsDto extends TeacherGradeAuthoringQuestionParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() assetId!: string;
}
export class TeacherGradeAuthoringGroupAssetParamsDto extends TeacherGradeAuthoringGroupParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() assetId!: string;
}
export class TeacherGradeAuthoringAssessmentAssetParamsDto extends TeacherClassroomAssessmentParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() assetId!: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import type { QuestionGroupContext } from '../../../common/question-groups/question-group.projection';
export class HomeworkSubmissionStudentDto {
  id!: string;
  displayName!: string;
  studentNumber!: string | null;
}

export class HomeworkSubmissionDto {
  @ApiPropertyOptional({ type: [Object] })
  groups?: QuestionGroupContext['groups'];
  @ApiPropertyOptional({ type: [Object] })
  displayItems?: QuestionGroupContext['displayItems'];
  id!: string;
  homeworkId!: string;
  targetId!: string;
  student!: HomeworkSubmissionStudentDto;
  status!: string;
  bodyText!: string | null;
  submittedAt!: string | null;
  reviewedAt!: string | null;
  reviewNote!: string | null;
  awardedMarks!: number | null;
  totalMarks!: number | null;
  isLate!: boolean;
  createdAt!: string;
  updatedAt!: string;
}

export class HomeworkSubmissionsPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class HomeworkSubmissionsListResponseDto {
  submissions!: HomeworkSubmissionDto[];
  pagination!: HomeworkSubmissionsPaginationDto;
}

export class HomeworkSubmissionResponseDto {
  submission!: HomeworkSubmissionDto;
}

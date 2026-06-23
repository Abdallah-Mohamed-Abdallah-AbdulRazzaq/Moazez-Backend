export class HomeworkSubmissionStudentDto {
  id!: string;
  displayName!: string;
  studentNumber!: string | null;
}

export class HomeworkSubmissionDto {
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

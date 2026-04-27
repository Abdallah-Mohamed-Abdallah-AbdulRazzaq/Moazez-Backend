import { IsOptional, IsUUID } from 'class-validator';

export class GetStudentGradeSnapshotQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

export class StudentGradeSnapshotRuleResponseDto {
  source!: string;
  ruleId!: string | null;
  passMark!: number;
  rounding!: string;
  gradingScale!: string;
}

export class StudentGradeSnapshotSubjectResponseDto {
  subjectId!: string;
  subjectName!: string;
  subjectNameAr!: string | null;
  subjectNameEn!: string | null;
  finalPercent!: number | null;
  completedWeight!: number;
  assessmentCount!: number;
  enteredCount!: number;
  missingCount!: number;
  absentCount!: number;
  status!: string;
}

export class StudentGradeSnapshotAssessmentResponseDto {
  assessmentId!: string;
  subjectId!: string;
  title!: string | null;
  titleEn!: string | null;
  titleAr!: string | null;
  type!: string;
  date!: string;
  weight!: number;
  maxScore!: number;
  itemId!: string | null;
  score!: number | null;
  percent!: number | null;
  weightedContribution!: number | null;
  status!: string;
  comment!: string | null;
  isVirtualMissing!: boolean;
}

export class StudentGradeSnapshotResponseDto {
  studentId!: string;
  enrollmentId!: string;
  academicYearId!: string;
  yearId!: string;
  termId!: string;
  subjectId!: string | null;
  rule!: StudentGradeSnapshotRuleResponseDto;
  finalPercent!: number | null;
  completedWeight!: number;
  status!: string;
  subjects!: StudentGradeSnapshotSubjectResponseDto[];
  assessments!: StudentGradeSnapshotAssessmentResponseDto[];
}

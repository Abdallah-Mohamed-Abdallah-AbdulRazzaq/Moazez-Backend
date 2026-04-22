import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';
import {
  STUDENT_NOTE_CATEGORY_API_VALUES,
  STUDENT_NOTE_VISIBILITY_API_VALUES,
  type StudentNoteCategoryApiValue,
  type StudentNoteVisibilityApiValue,
} from '../domain/student-note.enums';

class StudentNoteMutationDto {
  @IsOptional()
  @IsIn(STUDENT_NOTE_CATEGORY_API_VALUES)
  category?: StudentNoteCategoryApiValue;

  @IsOptional()
  @IsInt()
  @Min(-50)
  @Max(50)
  @NotEquals(0)
  xpAdjustment?: number;

  @IsOptional()
  @IsIn(STUDENT_NOTE_VISIBILITY_API_VALUES)
  visibility?: StudentNoteVisibilityApiValue;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  created_by?: string;
}

export class CreateStudentNoteDto extends StudentNoteMutationDto {
  @IsString()
  @MaxLength(3000)
  note!: string;
}

export class UpdateStudentNoteDto extends StudentNoteMutationDto {
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  note?: string;
}

export class StudentNoteResponseDto {
  id!: string;
  studentId!: string;
  date!: string;
  category!: StudentNoteCategoryApiValue | null;
  note!: string;
  xpAdjustment!: number | null;
  visibility!: StudentNoteVisibilityApiValue;
  created_by!: string | null;
}

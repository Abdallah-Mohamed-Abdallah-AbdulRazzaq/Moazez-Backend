export class LessonContentFileSummaryDto {
  fileId!: string;
  filename!: string;
  mimeType!: string;
  sizeBytes!: string;
}

export class LessonContentItemResponseDto {
  id!: string;
  contentItemId!: string;
  curriculumId!: string;
  unitId!: string;
  lessonId!: string;
  type!: string;
  title!: string;
  bodyText!: string | null;
  url!: string | null;
  file!: LessonContentFileSummaryDto | null;
  sortOrder!: number;
  isRequired!: boolean;
  estimatedMinutes!: number | null;
  metadata!: unknown;
  createdAt!: string;
  updatedAt!: string;
}

export class LessonContentListResponseDto {
  items!: LessonContentItemResponseDto[];
}

export class DeleteLessonContentItemResponseDto {
  ok!: true;
}

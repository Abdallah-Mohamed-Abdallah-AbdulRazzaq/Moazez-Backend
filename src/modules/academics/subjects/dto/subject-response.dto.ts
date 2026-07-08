export class SubjectResponseDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  code!: string | null;
  color!: string | null;
  isActive!: boolean;
}

export class SubjectsListResponseDto {
  items!: SubjectResponseDto[];
}

export class DeleteSubjectResponseDto {
  ok!: boolean;
}

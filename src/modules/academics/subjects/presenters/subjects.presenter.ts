import { Subject } from '@prisma/client';
import {
  SubjectResponseDto,
  SubjectsListResponseDto,
} from '../dto/subject-response.dto';

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

export function presentSubject(subject: Subject): SubjectResponseDto {
  return {
    id: subject.id,
    name: deriveName(subject.nameAr, subject.nameEn),
    nameAr: subject.nameAr,
    nameEn: subject.nameEn,
    code: subject.code ?? null,
    color: subject.color ?? null,
    isActive: subject.isActive,
    termId: null,
    stage: null,
  };
}

export function presentSubjects(subjects: Subject[]): SubjectsListResponseDto {
  return {
    items: subjects.map((subject) => presentSubject(subject)),
  };
}

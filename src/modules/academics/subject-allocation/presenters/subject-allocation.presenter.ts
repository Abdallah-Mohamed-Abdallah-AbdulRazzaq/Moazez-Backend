import {
  SubjectAllocationResponseDto,
  SubjectAllocationsListResponseDto,
} from '../dto/subject-allocation-response.dto';
import { SubjectAllocationRecord } from '../infrastructure/subject-allocation.repository';

export function presentSubjectAllocation(
  allocation: SubjectAllocationRecord,
): SubjectAllocationResponseDto {
  return {
    id: allocation.id,
    academicYearId: allocation.academicYearId,
    termId: allocation.termId,
    gradeId: allocation.gradeId,
    subjectId: allocation.subjectId,
    weeklyHours: allocation.weeklyHours,
    grade: {
      id: allocation.grade.id,
      nameAr: allocation.grade.nameAr,
      nameEn: allocation.grade.nameEn,
    },
    subject: {
      id: allocation.subject.id,
      nameAr: allocation.subject.nameAr,
      nameEn: allocation.subject.nameEn,
      code: allocation.subject.code ?? null,
      color: allocation.subject.color ?? null,
    },
    createdAt: allocation.createdAt.toISOString(),
    updatedAt: allocation.updatedAt.toISOString(),
  };
}

export function presentSubjectAllocations(
  allocations: SubjectAllocationRecord[],
): SubjectAllocationsListResponseDto {
  return {
    items: allocations.map((allocation) => presentSubjectAllocation(allocation)),
  };
}

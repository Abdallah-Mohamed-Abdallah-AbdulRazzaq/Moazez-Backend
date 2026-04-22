import {
  TeacherAllocationResponseDto,
  TeacherAllocationsListResponseDto,
} from '../dto/teacher-allocation-response.dto';
import { TeacherAllocationRecord } from '../infrastructure/teacher-allocation.repository';

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

function deriveFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

function presentTermStatus(isActive: boolean): 'open' | 'closed' {
  return isActive ? 'open' : 'closed';
}

export function presentTeacherAllocation(
  allocation: TeacherAllocationRecord,
): TeacherAllocationResponseDto {
  return {
    id: allocation.id,
    teacher: {
      id: allocation.teacherUser.id,
      fullName: deriveFullName(
        allocation.teacherUser.firstName,
        allocation.teacherUser.lastName,
      ),
      email: allocation.teacherUser.email,
    },
    subject: {
      id: allocation.subject.id,
      name: deriveName(allocation.subject.nameAr, allocation.subject.nameEn),
      nameAr: allocation.subject.nameAr,
      nameEn: allocation.subject.nameEn,
      code: allocation.subject.code ?? null,
    },
    classroom: {
      id: allocation.classroom.id,
      name: deriveName(allocation.classroom.nameAr, allocation.classroom.nameEn),
      nameAr: allocation.classroom.nameAr,
      nameEn: allocation.classroom.nameEn,
      sectionId: allocation.classroom.sectionId,
      roomId: allocation.classroom.roomId ?? null,
    },
    term: {
      id: allocation.term.id,
      academicYearId: allocation.term.academicYearId,
      name: deriveName(allocation.term.nameAr, allocation.term.nameEn),
      nameAr: allocation.term.nameAr,
      nameEn: allocation.term.nameEn,
      status: presentTermStatus(allocation.term.isActive),
    },
    createdAt: allocation.createdAt.toISOString(),
  };
}

export function presentTeacherAllocations(
  allocations: TeacherAllocationRecord[],
): TeacherAllocationsListResponseDto {
  return {
    items: allocations.map((allocation) => presentTeacherAllocation(allocation)),
  };
}

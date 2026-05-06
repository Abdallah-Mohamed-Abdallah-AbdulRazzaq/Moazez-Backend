import {
  StudentSubjectCardDto,
  StudentSubjectDetailResponseDto,
  StudentSubjectsListResponseDto,
  StudentSubjectUnsupportedDto,
} from '../dto/student-subjects.dto';
import {
  emptyStudentSubjectStats,
  StudentSubjectAllocationRecord,
  StudentSubjectStatsRecord,
} from '../infrastructure/student-subjects-read.adapter';

export interface StudentSubjectsPresenterInput {
  allocations: StudentSubjectAllocationRecord[];
  statsBySubjectId: Map<string, StudentSubjectStatsRecord>;
}

const UNSUPPORTED: StudentSubjectUnsupportedDto = {
  lessons: true,
  curriculumProgress: true,
  resources: true,
  reason: 'curriculum_lesson_resources_not_available',
};

export class StudentSubjectsPresenter {
  static presentList(
    input: StudentSubjectsPresenterInput,
  ): StudentSubjectsListResponseDto {
    return {
      subjects: uniqueSubjectAllocations(input.allocations).map((allocation) =>
        presentSubjectCard(allocation, input.statsBySubjectId),
      ),
      unsupported: UNSUPPORTED,
    };
  }

  static presentDetail(params: {
    allocation: StudentSubjectAllocationRecord;
    statsBySubjectId: Map<string, StudentSubjectStatsRecord>;
  }): StudentSubjectDetailResponseDto {
    const subject = {
      ...presentSubjectCard(params.allocation, params.statsBySubjectId),
      resources: {
        attachmentsCount: 0,
        unsupportedReason: 'safe_subject_resource_links_not_available',
      },
    };

    return {
      subject,
      lessons: [],
      assignments: [],
      attachments: [],
      unsupported: UNSUPPORTED,
    };
  }
}

function presentSubjectCard(
  allocation: StudentSubjectAllocationRecord,
  statsBySubjectId: Map<string, StudentSubjectStatsRecord>,
): StudentSubjectCardDto {
  const subject = allocation.subject;
  const classroom = allocation.classroom;
  const section = classroom.section;
  const grade = section.grade;
  const stats =
    statsBySubjectId.get(subject.id) ?? emptyStudentSubjectStats();

  return {
    id: subject.id,
    subjectId: subject.id,
    name: displayName(subject),
    code: subject.code,
    teacher: allocation.teacherUser
      ? {
          teacherUserId: allocation.teacherUser.id,
          displayName: fullName(allocation.teacherUser),
        }
      : null,
    classroom: {
      id: classroom.id,
      name: displayName(classroom),
    },
    grade: {
      id: grade.id,
      name: displayName(grade),
    },
    section: {
      id: section.id,
      name: displayName(section),
    },
    stats: {
      assessmentsCount: stats.assessmentsCount,
      gradedCount: stats.gradedCount,
      missingCount: stats.missingCount,
      absentCount: stats.absentCount,
      earnedScore: stats.earnedScore,
      maxScore: stats.maxScore,
      averagePercent: stats.averagePercent,
    },
    lessonsCount: null,
    totalHours: null,
    progress: null,
    iconKey: null,
    lessons_count: null,
    total_hours: null,
    icon_key: null,
  };
}

function uniqueSubjectAllocations(
  allocations: StudentSubjectAllocationRecord[],
): StudentSubjectAllocationRecord[] {
  const seen = new Set<string>();
  const unique: StudentSubjectAllocationRecord[] = [];

  for (const allocation of allocations) {
    if (seen.has(allocation.subjectId)) continue;
    seen.add(allocation.subjectId);
    unique.push(allocation);
  }

  return unique;
}

function displayName(node: { nameEn: string; nameAr: string }): string {
  return node.nameEn || node.nameAr;
}

function fullName(user: { firstName: string; lastName: string }): string {
  return [user.firstName, user.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

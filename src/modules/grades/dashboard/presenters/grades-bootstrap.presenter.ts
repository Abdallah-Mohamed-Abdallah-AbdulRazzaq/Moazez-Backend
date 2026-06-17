import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
} from '@prisma/client';
import { GetGradesBootstrapQueryDto } from '../dto/grades-bootstrap.dto';
import { GradesDashboardBootstrapData } from '../infrastructure/grades-dashboard-read.repository';

const SUPPORTED_GRADES_SCOPES = [
  'school',
  'stage',
  'grade',
  'section',
  'classroom',
] as const;

export function presentGradesBootstrap(
  data: GradesDashboardBootstrapData,
  query: GetGradesBootstrapQueryDto = {},
) {
  const defaults = resolveDefaults(data, query);

  return {
    academicYears: data.academicYears.map((year) => ({
      id: year.id,
      nameAr: year.nameAr,
      nameEn: year.nameEn,
      isActive: year.isActive,
    })),
    terms: data.terms.map((term) => ({
      id: term.id,
      academicYearId: term.academicYearId,
      nameAr: term.nameAr,
      nameEn: term.nameEn,
      startDate: formatDateOnly(term.startDate),
      endDate: formatDateOnly(term.endDate),
      isActive: term.isActive,
    })),
    stages: data.stages.map((stage) => ({
      id: stage.id,
      nameAr: stage.nameAr,
      nameEn: stage.nameEn,
      sortOrder: stage.sortOrder ?? null,
    })),
    grades: data.grades.map((grade) => ({
      id: grade.id,
      stageId: grade.stageId,
      nameAr: grade.nameAr,
      nameEn: grade.nameEn,
      sortOrder: grade.sortOrder ?? null,
    })),
    sections: data.sections.map((section) => ({
      id: section.id,
      gradeId: section.gradeId,
      nameAr: section.nameAr,
      nameEn: section.nameEn,
      sortOrder: section.sortOrder ?? null,
    })),
    classrooms: data.classrooms.map((classroom) => ({
      id: classroom.id,
      sectionId: classroom.sectionId,
      gradeId: classroom.section?.gradeId ?? null,
      nameAr: classroom.nameAr,
      nameEn: classroom.nameEn,
      isActive: true,
    })),
    subjects: data.subjects.map((subject) => ({
      id: subject.id,
      nameAr: subject.nameAr,
      nameEn: subject.nameEn,
      code: subject.code ?? null,
      isActive: subject.isActive,
    })),
    defaults,
    supportedScopes: [...SUPPORTED_GRADES_SCOPES],
    assessmentTypes: Object.values(GradeAssessmentType),
    deliveryModes: Object.values(GradeAssessmentDeliveryMode),
    approvalStatuses: Object.values(GradeAssessmentApprovalStatus).map((status) =>
      status.toLowerCase(),
    ),
  };
}

function resolveDefaults(
  data: GradesDashboardBootstrapData,
  query: GetGradesBootstrapQueryDto,
): { academicYearId: string | null; termId: string | null } {
  const requestedAcademicYearId = query.academicYearId ?? query.yearId;
  const requestedYear = requestedAcademicYearId
    ? data.academicYears.find((year) => year.id === requestedAcademicYearId)
    : null;
  const defaultYear =
    requestedYear ?? data.academicYears.find((year) => year.isActive) ?? null;
  const defaultYearId = defaultYear?.id ?? null;

  const requestedTerm = query.termId
    ? data.terms.find(
        (term) =>
          term.id === query.termId &&
          (!defaultYearId || term.academicYearId === defaultYearId),
      )
    : null;
  const defaultTerm =
    requestedTerm ??
    data.terms.find(
      (term) =>
        term.isActive && (!defaultYearId || term.academicYearId === defaultYearId),
    ) ??
    null;

  return {
    academicYearId: defaultYearId,
    termId: defaultYearId ? (defaultTerm?.id ?? null) : null,
  };
}

function formatDateOnly(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

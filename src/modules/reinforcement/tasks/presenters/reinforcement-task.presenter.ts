import {
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementTargetScope,
  ReinforcementTaskStatus,
} from '@prisma/client';
import {
  ReinforcementFilterOptionsResponseDto,
  ReinforcementTaskResponseDto,
  ReinforcementTasksListResponseDto,
} from '../dto/reinforcement-task.dto';
import {
  calculateAssignmentProgressSummary,
} from '../domain/reinforcement-task-domain';
import {
  EnrollmentTargetRecord,
  ReinforcementFilterOptionsRecord,
  ReinforcementTaskRecord,
} from '../infrastructure/reinforcement-tasks.repository';

export function presentReinforcementTask(
  task: ReinforcementTaskRecord,
): ReinforcementTaskResponseDto {
  return {
    id: task.id,
    academicYearId: task.academicYearId,
    yearId: task.academicYearId,
    termId: task.termId,
    subjectId: task.subjectId,
    titleEn: task.titleEn,
    titleAr: task.titleAr,
    descriptionEn: task.descriptionEn,
    descriptionAr: task.descriptionAr,
    source: presentEnum(task.source),
    status: presentEnum(task.status),
    reward: {
      type: task.rewardType ? presentEnum(task.rewardType) : null,
      value: presentDecimal(task.rewardValue),
      labelEn: task.rewardLabelEn,
      labelAr: task.rewardLabelAr,
    },
    dueDate: presentNullableDate(task.dueDate),
    assignedById: task.assignedById,
    assignedByName: task.assignedByName,
    cancelledAt: presentNullableDate(task.cancelledAt),
    cancellationReason: task.cancellationReason,
    targets: task.targets.map((target) => ({
      id: target.id,
      scopeType: presentEnum(target.scopeType),
      scopeKey: target.scopeKey,
      stageId: target.stageId,
      gradeId: target.gradeId,
      sectionId: target.sectionId,
      classroomId: target.classroomId,
      studentId: target.studentId,
    })),
    stages: task.stages.map((stage) => ({
      id: stage.id,
      sortOrder: stage.sortOrder,
      titleEn: stage.titleEn,
      titleAr: stage.titleAr,
      descriptionEn: stage.descriptionEn,
      descriptionAr: stage.descriptionAr,
      proofType: presentEnum(stage.proofType),
      requiresApproval: stage.requiresApproval,
    })),
    assignmentSummary: calculateAssignmentProgressSummary(task.assignments),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function presentReinforcementTasks(params: {
  items: ReinforcementTaskRecord[];
  total: number;
  limit?: number | null;
  offset?: number | null;
}): ReinforcementTasksListResponseDto {
  return {
    items: params.items.map((task) => presentReinforcementTask(task)),
    total: params.total,
    limit: params.limit ?? null,
    offset: params.offset ?? null,
  };
}

export function presentReinforcementFilterOptions(
  options: ReinforcementFilterOptionsRecord,
): ReinforcementFilterOptionsResponseDto {
  return {
    academicYears: options.academicYears.map((year) => ({
      id: year.id,
      name: deriveName(year.nameAr, year.nameEn),
      nameAr: year.nameAr,
      nameEn: year.nameEn,
      startDate: formatDateOnly(year.startDate),
      endDate: formatDateOnly(year.endDate),
      isActive: year.isActive,
    })),
    terms: options.terms.map((term) => ({
      id: term.id,
      academicYearId: term.academicYearId,
      yearId: term.academicYearId,
      name: deriveName(term.nameAr, term.nameEn),
      nameAr: term.nameAr,
      nameEn: term.nameEn,
      startDate: formatDateOnly(term.startDate),
      endDate: formatDateOnly(term.endDate),
      isActive: term.isActive,
      status: term.isActive ? 'open' : 'closed',
    })),
    stages: options.stages.map((stage) => ({
      id: stage.id,
      name: deriveName(stage.nameAr, stage.nameEn),
      nameAr: stage.nameAr,
      nameEn: stage.nameEn,
      sortOrder: stage.sortOrder,
    })),
    grades: options.grades.map((grade) => ({
      id: grade.id,
      stageId: grade.stageId,
      name: deriveName(grade.nameAr, grade.nameEn),
      nameAr: grade.nameAr,
      nameEn: grade.nameEn,
      sortOrder: grade.sortOrder,
      capacity: grade.capacity ?? null,
    })),
    sections: options.sections.map((section) => ({
      id: section.id,
      stageId: section.grade.stageId,
      gradeId: section.gradeId,
      name: deriveName(section.nameAr, section.nameEn),
      nameAr: section.nameAr,
      nameEn: section.nameEn,
      sortOrder: section.sortOrder,
      capacity: section.capacity ?? null,
    })),
    classrooms: options.classrooms.map((classroom) => ({
      id: classroom.id,
      stageId: classroom.section.grade.stageId,
      gradeId: classroom.section.gradeId,
      sectionId: classroom.sectionId,
      name: deriveName(classroom.nameAr, classroom.nameEn),
      nameAr: classroom.nameAr,
      nameEn: classroom.nameEn,
      sortOrder: classroom.sortOrder,
      capacity: classroom.capacity ?? null,
    })),
    subjects: options.subjects.map((subject) => ({
      id: subject.id,
      name: deriveName(subject.nameAr, subject.nameEn),
      nameAr: subject.nameAr,
      nameEn: subject.nameEn,
      code: subject.code ?? null,
      color: subject.color ?? null,
      isActive: subject.isActive,
    })),
    students: presentStudentOptions(options.students),
    sources: enumOptions(Object.values(ReinforcementSource)),
    statuses: enumOptions(Object.values(ReinforcementTaskStatus)),
    targetScopes: enumOptions(Object.values(ReinforcementTargetScope)),
    proofTypes: enumOptions(Object.values(ReinforcementProofType)),
    rewardTypes: enumOptions(Object.values(ReinforcementRewardType)),
  };
}

export function presentEnum(value: string): string {
  return value.toLowerCase();
}

export function presentDecimal(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue =
    typeof value === 'object' && 'toNumber' in value
      ? (value as { toNumber: () => number }).toNumber()
      : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function presentStudentOptions(enrollments: EnrollmentTargetRecord[]) {
  const byStudentId = new Map<string, EnrollmentTargetRecord>();
  for (const enrollment of enrollments) {
    if (!byStudentId.has(enrollment.studentId)) {
      byStudentId.set(enrollment.studentId, enrollment);
    }
  }

  return [...byStudentId.values()].map((enrollment) => ({
    id: enrollment.student.id,
    studentId: enrollment.student.id,
    name: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
    firstName: enrollment.student.firstName,
    lastName: enrollment.student.lastName,
    enrollmentId: enrollment.id,
    classroomId: enrollment.classroomId,
    sectionId: enrollment.classroom.sectionId,
    gradeId: enrollment.classroom.section.gradeId,
    stageId: enrollment.classroom.section.grade.stageId,
  }));
}

function enumOptions(values: string[]) {
  return values.map((value) => ({
    value: presentEnum(value),
    label: presentEnum(value),
  }));
}

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

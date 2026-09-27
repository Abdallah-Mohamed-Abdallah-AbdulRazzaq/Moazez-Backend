import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { AcademicContentLibraryResolvedScope } from '../domain/academic-content-library.query';

export type AcademicContentScopeQuery = {
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
};

export async function resolveAcademicContentScope(
  prisma: PrismaService,
  schoolId: string,
  query: AcademicContentScopeQuery,
): Promise<AcademicContentLibraryResolvedScope | null | undefined> {
  if (query.classroomId) {
    const row = await prisma.classroom.findFirst({
      where: { id: query.classroomId, schoolId, deletedAt: null },
      select: {
        section: {
          select: {
            id: true,
            deletedAt: true,
            grade: {
              select: {
                id: true,
                deletedAt: true,
                stage: { select: { id: true, deletedAt: true } },
              },
            },
          },
        },
      },
    });
    const section = row?.section;
    const grade = section?.grade;
    const stage = grade?.stage;
    if (
      !section ||
      section.deletedAt ||
      !grade ||
      grade.deletedAt ||
      !stage ||
      stage.deletedAt ||
      (query.sectionId && query.sectionId !== section.id) ||
      (query.gradeId && query.gradeId !== grade.id) ||
      (query.stageId && query.stageId !== stage.id)
    )
      return null;
    return {
      kind: 'CLASSROOM',
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: query.classroomId,
    };
  }
  if (query.sectionId) {
    const row = await prisma.section.findFirst({
      where: { id: query.sectionId, schoolId, deletedAt: null },
      select: {
        grade: {
          select: {
            id: true,
            deletedAt: true,
            stage: { select: { id: true, deletedAt: true } },
          },
        },
      },
    });
    const grade = row?.grade;
    const stage = grade?.stage;
    if (
      !grade ||
      grade.deletedAt ||
      !stage ||
      stage.deletedAt ||
      (query.gradeId && query.gradeId !== grade.id) ||
      (query.stageId && query.stageId !== stage.id)
    )
      return null;
    return {
      kind: 'SECTION',
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: query.sectionId,
    };
  }
  if (query.gradeId) {
    const row = await prisma.grade.findFirst({
      where: { id: query.gradeId, schoolId, deletedAt: null },
      select: { stage: { select: { id: true, deletedAt: true } } },
    });
    if (
      !row ||
      row.stage.deletedAt ||
      (query.stageId && query.stageId !== row.stage.id)
    )
      return null;
    return { kind: 'GRADE', stageId: row.stage.id, gradeId: query.gradeId };
  }
  if (query.stageId) {
    const row = await prisma.stage.findFirst({
      where: { id: query.stageId, schoolId, deletedAt: null },
      select: { id: true },
    });
    return row ? { kind: 'STAGE', stageId: row.id } : null;
  }
  return undefined;
}

// Both Library and Review Queue use the same applicable-target interpretation.
// The SQL aliases c (content) and t (target) are fixed in both callers.
export function academicContentTargetScopePredicate(
  scope: AcademicContentLibraryResolvedScope,
): Prisma.Sql {
  const anchors: Prisma.Sql[] = [Prisma.sql`t.scope_type = 'SCHOOL'`];
  anchors.push(
    Prisma.sql`(t.scope_type = 'STAGE' AND t.stage_id = ${scope.stageId}::uuid)`,
  );
  if (scope.gradeId)
    anchors.push(
      Prisma.sql`(t.scope_type = 'GRADE' AND t.grade_id = ${scope.gradeId}::uuid)`,
    );
  if (scope.sectionId)
    anchors.push(
      Prisma.sql`(t.scope_type = 'SECTION' AND t.section_id = ${scope.sectionId}::uuid)`,
    );
  if (scope.classroomId)
    anchors.push(
      Prisma.sql`(t.scope_type = 'CLASSROOM' AND t.classroom_id = ${scope.classroomId}::uuid)`,
    );
  return Prisma.sql`(${Prisma.join(anchors, ' OR ')})`;
}

export function academicContentSubjectApplicability(
  scope: AcademicContentLibraryResolvedScope | undefined,
  academicYear: Prisma.Sql,
  term: Prisma.Sql,
): Prisma.Sql {
  let gradeScope: Prisma.Sql;
  if (scope?.gradeId)
    gradeScope = Prisma.sql`sa.grade_id = ${scope.gradeId}::uuid`;
  else if (scope) gradeScope = Prisma.sql`g.stage_id = ${scope.stageId}::uuid`;
  else
    gradeScope = Prisma.sql`(
      t.scope_type = 'SCHOOL' OR
      (t.scope_type = 'STAGE' AND t.stage_id = g.stage_id) OR
      (t.scope_type = 'GRADE' AND t.grade_id = g.id) OR
      (t.scope_type = 'SECTION' AND EXISTS (
        SELECT 1 FROM sections target_section
        WHERE target_section.id = t.section_id
          AND target_section.school_id = c.school_id
          AND target_section.deleted_at IS NULL
          AND target_section.grade_id = g.id)) OR
      (t.scope_type = 'CLASSROOM' AND EXISTS (
        SELECT 1 FROM classrooms target_classroom
        JOIN sections target_section
          ON target_section.id = target_classroom.section_id
          AND target_section.school_id = c.school_id
          AND target_section.deleted_at IS NULL
        WHERE target_classroom.id = t.classroom_id
          AND target_classroom.school_id = c.school_id
          AND target_classroom.deleted_at IS NULL
          AND target_section.grade_id = g.id))
    )`;
  return Prisma.sql`EXISTS (
      SELECT 1 FROM subject_allocations sa
      JOIN grades g ON g.id = sa.grade_id
        AND g.school_id = c.school_id AND g.deleted_at IS NULL
      JOIN stages stage ON stage.id = g.stage_id
        AND stage.school_id = c.school_id AND stage.deleted_at IS NULL
      WHERE sa.school_id = c.school_id
        AND sa.academic_year_id = ${academicYear}
        AND sa.term_id = ${term}
        AND sa.subject_id = t.subject_id
        AND sa.weekly_hours > 0
        AND sa.deleted_at IS NULL
        AND ${gradeScope})`;
}

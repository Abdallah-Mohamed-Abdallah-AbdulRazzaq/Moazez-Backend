import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  Prisma,
  type AcademicContentPreparationTemplate,
} from '@prisma/client';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  normalizePreparationTemplate,
  templateSummary,
  type PreparationTemplateFields,
  type PreparationTemplateInput,
} from '../domain/academic-content-preparation-template.policy';

type Scope = { schoolId: string; organizationId: string; actorId: string };
export type PreparationTemplateApplicability = {
  schoolId: string;
  stageId: string;
  subjectId: string;
};

const notFound = () =>
  new DomainException({
    code: 'academic_content.preparation_template.not_found',
    message: 'Preparation template not found',
    httpStatus: HttpStatus.NOT_FOUND,
  });
const scopeNotFound = () =>
  new DomainException({
    code: 'academic_content.preparation_template.scope_not_found',
    message: 'Preparation template scope unavailable',
    httpStatus: HttpStatus.NOT_FOUND,
  });
const duplicateName = () =>
  new DomainException({
    code: 'academic_content.preparation_template.duplicate_name',
    message: 'Preparation template name already exists',
    httpStatus: HttpStatus.CONFLICT,
  });

function businessFields(
  row: AcademicContentPreparationTemplate,
): PreparationTemplateFields {
  return {
    name: row.name,
    normalizedName: row.normalizedName,
    description: row.description,
    stageId: row.stageId,
    subjectId: row.subjectId,
    topic: row.topic,
    objectives: row.objectives as unknown as string[],
    learningOutcomes: row.learningOutcomes as unknown as string[],
    teachingStrategies: row.teachingStrategies as unknown as string[],
    activities: row.activities as unknown as string[],
    resourceNotes: row.resourceNotes,
    assessmentNotes: row.assessmentNotes,
    teacherNotes: row.teacherNotes,
  };
}

export function presentTemplate(row: AcademicContentPreparationTemplate) {
  const fields = businessFields(row);
  return {
    id: row.id,
    name: fields.name,
    description: fields.description,
    stageId: fields.stageId,
    subjectId: fields.subjectId,
    topic: fields.topic,
    objectives: fields.objectives,
    learningOutcomes: fields.learningOutcomes,
    teachingStrategies: fields.teachingStrategies,
    activities: fields.activities,
    resourceNotes: fields.resourceNotes,
    assessmentNotes: fields.assessmentNotes,
    teacherNotes: fields.teacherNotes,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class AcademicContentPreparationTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    schoolId: string,
    query: {
      stageId?: string;
      subjectId?: string;
      search?: string;
      page: number;
      limit: number;
    },
    applicable?: PreparationTemplateApplicability,
  ) {
    const clauses: Prisma.Sql[] = [
      Prisma.sql`school_id = ${schoolId}::uuid`,
      Prisma.sql`deleted_at IS NULL`,
    ];
    if (query.stageId)
      clauses.push(Prisma.sql`stage_id = ${query.stageId}::uuid`);
    if (query.subjectId)
      clauses.push(Prisma.sql`subject_id = ${query.subjectId}::uuid`);
    if (applicable) {
      clauses.push(
        Prisma.sql`(stage_id IS NULL OR stage_id = ${applicable.stageId}::uuid)`,
      );
      clauses.push(
        Prisma.sql`(subject_id IS NULL OR subject_id = ${applicable.subjectId}::uuid)`,
      );
    }
    if (query.search)
      clauses.push(Prisma.sql`(
        POSITION(LOWER(${query.search}) IN LOWER(name)) > 0
        OR POSITION(LOWER(${query.search}) IN LOWER(COALESCE(description, ''))) > 0
      )`);
    const where = Prisma.sql`FROM academic_content_preparation_templates WHERE ${Prisma.join(clauses, ' AND ')}`;
    type ListRow = {
      id: string;
      name: string;
      description: string | null;
      stageId: string | null;
      subjectId: string | null;
      objectivesCount: number;
      learningOutcomesCount: number;
      teachingStrategiesCount: number;
      activitiesCount: number;
      updatedAt: Date;
    };
    const [rows, total] = await Promise.all([
      this.prisma.$queryRaw<ListRow[]>(Prisma.sql`
        SELECT id, name, description,
          stage_id AS "stageId", subject_id AS "subjectId",
          jsonb_array_length(objectives) AS "objectivesCount",
          jsonb_array_length(learning_outcomes) AS "learningOutcomesCount",
          jsonb_array_length(teaching_strategies) AS "teachingStrategiesCount",
          jsonb_array_length(activities) AS "activitiesCount",
          updated_at AS "updatedAt"
        ${where}
        ORDER BY normalized_name ASC, id ASC
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS total ${where}`),
    ]);
    return {
      items: rows.map((row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      })),
      page: query.page,
      limit: query.limit,
      total: Number(total[0]?.total ?? 0),
    };
  }

  async detail(schoolId: string, id: string) {
    const row = await this.prisma.academicContentPreparationTemplate.findFirst({
      where: { id, schoolId, deletedAt: null },
    });
    if (!row) throw notFound();
    return presentTemplate(row);
  }

  listApplicable(
    scope: PreparationTemplateApplicability,
    query: { search?: string; page: number; limit: number },
  ) {
    return this.list(scope.schoolId, query, scope);
  }

  async detailApplicable(scope: PreparationTemplateApplicability, id: string) {
    const row = await this.prisma.academicContentPreparationTemplate.findFirst({
      where: {
        id,
        schoolId: scope.schoolId,
        deletedAt: null,
        AND: [
          { OR: [{ stageId: null }, { stageId: scope.stageId }] },
          { OR: [{ subjectId: null }, { subjectId: scope.subjectId }] },
        ],
      },
    });
    if (!row) throw notFound();
    return presentTemplate(row);
  }

  private async validateScope(
    tx: Prisma.TransactionClient,
    schoolId: string,
    fields: PreparationTemplateFields,
  ) {
    if (fields.stageId) {
      const stage = await tx.stage.findFirst({
        where: { id: fields.stageId, schoolId, deletedAt: null },
        select: { id: true },
      });
      if (!stage) throw scopeNotFound();
    }
    if (fields.subjectId) {
      const subject = await tx.subject.findFirst({
        where: { id: fields.subjectId, schoolId, deletedAt: null },
        select: { id: true },
      });
      if (!subject) throw scopeNotFound();
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    scope: Scope,
    id: string,
    action: 'create' | 'update' | 'delete',
    before: PreparationTemplateFields | null,
    after: PreparationTemplateFields | null,
  ) {
    await tx.auditLog.create({
      data: {
        actorId: scope.actorId,
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        module: 'academic-content',
        action: `academics.academic_content.preparation_template.${action}`,
        resourceType: 'academic_content_preparation_template',
        resourceId: id,
        outcome: AuditOutcome.SUCCESS,
        before: before ? templateSummary(before) : Prisma.DbNull,
        after: after ? templateSummary(after) : Prisma.DbNull,
      },
    });
  }

  private async withRetry<T>(work: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await work();
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') throw duplicateName();
          if (error.code === 'P2003') throw scopeNotFound();
          if (error.code === 'P2034' && attempt < 2) continue;
          // Raw FOR UPDATE surfaces PostgreSQL serialization/deadlock as P2010.
          if (
            error.code === 'P2010' &&
            ['40001', '40P01'].includes(String(error.meta?.code)) &&
            attempt < 2
          )
            continue;
        }
        throw error;
      }
    }
    throw new Error('Unreachable preparation template retry state');
  }

  create(scope: Scope, fields: PreparationTemplateFields) {
    return this.withRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.validateScope(tx, scope.schoolId, fields);
          const row = await tx.academicContentPreparationTemplate.create({
            data: {
              ...fields,
              schoolId: scope.schoolId,
              createdByUserId: scope.actorId,
            },
          });
          await this.audit(tx, scope, row.id, 'create', null, fields);
          return presentTemplate(row);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  update(scope: Scope, id: string, patch: PreparationTemplateInput) {
    return this.withRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw(Prisma.sql`
            SELECT id FROM academic_content_preparation_templates
            WHERE id = ${id}::uuid AND school_id = ${scope.schoolId}::uuid
              AND deleted_at IS NULL FOR UPDATE`);
          const current = await tx.academicContentPreparationTemplate.findFirst(
            {
              where: { id, schoolId: scope.schoolId, deletedAt: null },
            },
          );
          if (!current) throw notFound();
          const before = businessFields(current);
          const after = normalizePreparationTemplate({ ...before, ...patch });
          await this.validateScope(tx, scope.schoolId, after);
          if (JSON.stringify(before) === JSON.stringify(after))
            return presentTemplate(current);
          const row = await tx.academicContentPreparationTemplate.update({
            where: {
              id_schoolId: {
                id,
                schoolId: scope.schoolId,
              },
            },
            data: { ...after, updatedByUserId: scope.actorId },
          });
          await this.audit(tx, scope, id, 'update', before, after);
          return presentTemplate(row);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  delete(scope: Scope, id: string) {
    return this.withRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw(Prisma.sql`
            SELECT id FROM academic_content_preparation_templates
            WHERE id = ${id}::uuid AND school_id = ${scope.schoolId}::uuid
              AND deleted_at IS NULL FOR UPDATE`);
          const current = await tx.academicContentPreparationTemplate.findFirst(
            {
              where: { id, schoolId: scope.schoolId, deletedAt: null },
            },
          );
          if (!current) throw notFound();
          await tx.academicContentPreparationTemplate.update({
            where: {
              id_schoolId: {
                id,
                schoolId: scope.schoolId,
              },
            },
            data: { deletedAt: new Date(), updatedByUserId: scope.actorId },
          });
          await this.audit(
            tx,
            scope,
            id,
            'delete',
            businessFields(current),
            null,
          );
          return { ok: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { ResultActor } from '../../application/result-actor';
import type { ResultSheetTarget } from '../../application/result-foundation.types';
import type { ResultField } from '../../domain/result-definition';
import { cellColumns, type ResultValue } from '../../domain/result-value';

const named = { id: true, nameAr: true, nameEn: true } as const;
const studentSummary = {
  id: true,
  firstName: true,
  lastName: true,
  fatherNameEn: true,
  grandfatherNameEn: true,
  firstNameAr: true,
  fatherNameAr: true,
  grandfatherNameAr: true,
  familyNameAr: true,
} satisfies Prisma.StudentSelect;

export const gradebookSheetInclude = {
  draftDefinition: { select: { configuration: true, contentDigest: true } },
  acceptedDefinition: { select: { configuration: true } },
  school: { select: { id: true, name: true } },
  reportingPeriod: {
    include: { academicYear: { select: named }, term: { select: named } },
  },
  group: {
    select: {
      id: true,
      kind: true,
      subjectId: true,
      labelAr: true,
      labelEn: true,
    },
  },
  classroom: {
    select: {
      ...named,
      section: {
        select: {
          ...named,
          grade: {
            select: { ...named, stage: { select: named } },
          },
        },
      },
    },
  },
} satisfies Prisma.ResultSheetInclude;
export type GradebookSheet = Prisma.ResultSheetGetPayload<{
  include: typeof gradebookSheetInclude;
}>;

export interface GradebookSheetFilters {
  reportingPeriodId?: string;
  groupIds?: string[];
  classroomIds?: string[];
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  search?: string;
}

export interface GradebookRowFilters {
  studentIds?: string[];
  search?: string;
}

export type ResultDraftChange = {
  slotId: string;
  field: ResultField;
  expectedVersion: number;
  before: ResultValue;
  after: ResultValue;
  reason?: string;
};

type CommittedCell = {
  id: string;
  slotId: string;
  fieldId: string;
  version: number;
};

@Injectable()
export class ResultGradebookRepository {
  async sheet(
    client: Prisma.TransactionClient,
    schoolId: string,
    id: string,
    stableStructure = false,
  ) {
    if (stableStructure)
      await client.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM result_sheets WHERE school_id = ${schoolId}::uuid AND id = ${id}::uuid FOR KEY SHARE
    `;
    const sheet = await client.resultSheet.findFirst({
      where: { schoolId, id },
      include: gradebookSheetInclude,
    });
    if (!sheet || !sheet.draftDefinitionVersionId)
      throw new NotFoundDomainException();
    return {
      ...sheet,
      draftDefinitionVersionId: sheet.draftDefinitionVersionId,
    };
  }

  list(
    client: Prisma.TransactionClient,
    schoolId: string,
    filters: GradebookSheetFilters,
    after: string | null,
    limit: number,
  ) {
    return client.resultSheet.findMany({
      where: {
        schoolId,
        id: after ? { gt: after } : undefined,
        reportingPeriodId: filters.reportingPeriodId,
        groupId: filters.groupIds ? { in: filters.groupIds } : undefined,
        classroomId: filters.classroomIds
          ? { in: filters.classroomIds }
          : undefined,
        classroom: {
          deletedAt: null,
          sectionId: filters.sectionId,
          section: {
            deletedAt: null,
            gradeId: filters.gradeId,
            grade: {
              deletedAt: null,
              stageId: filters.stageId,
              stage: { deletedAt: null },
            },
          },
        },
        group: {
          archivedAt: null,
          OR: [
            { subjectId: null },
            { subject: { deletedAt: null, isActive: true } },
          ],
        },
        reportingPeriod: {
          academicYear: { deletedAt: null },
          OR: [{ termId: null }, { term: { deletedAt: null } }],
        },
        OR: filters.search
          ? [
              {
                group: {
                  labelAr: { contains: filters.search, mode: 'insensitive' },
                },
              },
              {
                group: {
                  labelEn: { contains: filters.search, mode: 'insensitive' },
                },
              },
              {
                classroom: {
                  nameAr: { contains: filters.search, mode: 'insensitive' },
                },
              },
              {
                classroom: {
                  nameEn: { contains: filters.search, mode: 'insensitive' },
                },
              },
            ]
          : undefined,
      },
      include: gradebookSheetInclude,
      orderBy: { id: 'asc' },
      take: limit,
    });
  }

  rows(
    client: Prisma.TransactionClient,
    schoolId: string,
    sheetId: string,
    args: {
      filters?: GradebookRowFilters;
      slots?: string[];
      fieldIds: string[];
      after?: string | null;
      take: number;
    },
  ) {
    const search = args.filters?.search;
    return client.resultSlot.findMany({
      where: {
        schoolId,
        sheetId,
        id: args.slots
          ? { in: args.slots }
          : args.after
            ? { gt: args.after }
            : undefined,
        studentId: args.filters?.studentIds
          ? { in: args.filters.studentIds }
          : undefined,
        student: search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { firstNameAr: { contains: search, mode: 'insensitive' } },
                { familyNameAr: { contains: search, mode: 'insensitive' } },
              ],
            }
          : undefined,
      },
      include: {
        student: { select: studentSummary },
        cells: { where: { schoolId, fieldId: { in: args.fieldIds } } },
      },
      orderBy: { id: 'asc' },
      take: args.take,
    });
  }

  async bump(
    client: Prisma.TransactionClient,
    schoolId: string,
    sheetId: string,
    slots: string[],
  ) {
    const updatedSlots = await client.$queryRaw<
      Array<{ id: string; revision: number }>
    >`
      WITH locked AS (
        SELECT id FROM result_slots
        WHERE school_id = ${schoolId}::uuid AND sheet_id = ${sheetId}::uuid
          AND id IN (${Prisma.join(slots.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY id FOR NO KEY UPDATE
      )
      UPDATE result_slots s SET revision = s.revision + 1, updated_at = clock_timestamp()
      FROM locked WHERE s.id = locked.id AND s.school_id = ${schoolId}::uuid
      RETURNING s.id, s.revision
    `;
    const sheet = await client.resultSheet.update({
      where: { id_schoolId: { id: sheetId, schoolId } },
      data: { dataGeneration: { increment: 1 } },
      select: { sheetRevision: true, dataGeneration: true },
    });
    return { sheet, updatedSlots };
  }

  async apply(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    sheet: ResultSheetTarget & { id: string; draftDefinitionVersionId: string },
    changes: ResultDraftChange[],
  ) {
    const values = changes
      .map((change) => ({
        slot: change.slotId,
        field: change.field.id,
        kind: change.field.kind,
        expected: change.expectedVersion,
        reason: change.reason ?? null,
        ...cellColumns(change.after),
      }))
      .sort((a, b) => (a.slot + a.field).localeCompare(b.slot + b.field));
    return client.$queryRaw<CommittedCell[]>`
      WITH rows AS (
        SELECT input.* FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb) AS input (
          slot uuid, field uuid, kind result_field_kind, expected int, reason text,
          status result_value_status, "numericValue" numeric, "textValue" text,
          "optionCode" text, outcome result_pass_fail, "booleanValue" boolean
        )
        JOIN result_slots placement ON placement.id = input.slot AND placement.school_id = ${actor.schoolId}::uuid
        WHERE placement.sheet_id = ${sheet.id}::uuid
      ), locked AS (
        SELECT existing.id FROM result_cells existing
        JOIN rows ON rows.slot = existing.slot_id AND rows.field = existing.field_id
        WHERE existing.school_id = ${actor.schoolId}::uuid AND rows.expected > 0
        ORDER BY existing.slot_id, existing.field_id FOR NO KEY UPDATE OF existing
      ), updated AS (
        UPDATE result_cells existing
        SET version = existing.version + 1, updated_by_id = ${actor.actorId}::uuid, updated_at = clock_timestamp(),
          definition_version_id = ${sheet.draftDefinitionVersionId}::uuid,
          status = rows.status, numeric_value = rows."numericValue", text_value = rows."textValue",
          option_code = rows."optionCode", outcome = rows.outcome, boolean_value = rows."booleanValue", state_reason = rows.reason
        FROM locked, rows
        WHERE existing.id = locked.id AND existing.school_id = ${actor.schoolId}::uuid
          AND existing.slot_id = rows.slot AND existing.field_id = rows.field AND existing.field_kind = rows.kind
          AND existing.version = rows.expected
        RETURNING existing.id, existing.slot_id, existing.field_id, existing.version
      ), inserted AS (
        INSERT INTO result_cells (
          school_id, slot_id, field_id, definition_version_id, field_kind,
          status, numeric_value, text_value, option_code, outcome, boolean_value, state_reason, updated_by_id, updated_at
        )
        SELECT ${actor.schoolId}::uuid, slot, field, ${sheet.draftDefinitionVersionId}::uuid, kind,
          status, "numericValue", "textValue", "optionCode", outcome, "booleanValue", reason, ${actor.actorId}::uuid, clock_timestamp()
        FROM rows WHERE expected = 0 ORDER BY slot, field
        ON CONFLICT (school_id, slot_id, field_id) DO NOTHING
        RETURNING id, slot_id, field_id, version
      )
      SELECT id, slot_id AS "slotId", field_id AS "fieldId", version FROM updated
      UNION ALL SELECT id, slot_id, field_id, version FROM inserted
    `;
  }
}

export type GradebookRow = Awaited<
  ReturnType<ResultGradebookRepository['rows']>
>[number];

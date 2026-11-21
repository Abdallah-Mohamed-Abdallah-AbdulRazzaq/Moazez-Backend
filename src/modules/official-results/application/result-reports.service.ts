import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { OfficialResultsError } from '../domain/official-results.error';
import { currentRosterInstant } from '../domain/reporting-dates';
import { resultValue } from '../domain/result-value';
import {
  ResultAuthorizationRepository,
  type ResultPermissionCheck,
} from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import { ResultGradebookRepository } from '../infrastructure/repositories/result-gradebook.repository';
import { ResultRosterRepository } from '../infrastructure/repositories/result-roster.repository';
import { requireResultActor } from './result-actor';
import { presentGradebookRow } from './result-gradebook.presenter';
import { ResultGradebookService } from './result-gradebook.service';
import {
  presentResultPage,
  readResultCursor,
  type ResultListQuery,
} from './result-page';

type Surface = 'SCHOOL' | 'TEACHER';
export type ResultAnalyticalQuery = ResultListQuery & {
  sheetId?: string;
  reportingPeriodId?: string;
  classroomId?: string;
  groupId?: string;
  studentId?: string;
  fieldId?: string;
};
type Workspace = Awaited<ReturnType<ResultGradebookService['workspace']>>;
const historicallyVisible = new Set([
  'RECORDED',
  'ABSENT',
  'EXCUSED',
  'NOT_APPLICABLE',
  'MISSING',
]);

@Injectable()
export class ResultReportsService {
  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly auth: ResultAuthorizationRepository,
    private readonly gradebook: ResultGradebookService,
    private readonly sheets: ResultGradebookRepository,
    private readonly roster: ResultRosterRepository,
  ) {}

  missing(surface: Surface, query: ResultAnalyticalQuery) {
    const actor = requireResultActor(surface);
    const { limit: requested, cursor, ...filter } = query;
    const scope = actor.schoolId + ':' + actor.actorId;
    const { limit, after } = readResultCursor(
      { limit: requested, cursor },
      scope,
      'missing',
      filter,
    );
    return this.commands.readSnapshot(
      async (client) => {
        const access = await this.auth.permissions(client, actor);
        const workspaces = await this.authorizedWorkspaces(
          client,
          access,
          filter,
        );
        const items: {
          id: string;
          sheetId: string;
          slotId: string;
          studentId: string;
          studentName: string;
          enrollmentId: string;
          fieldId: string;
          fieldLabel: { ar: string; en: string };
          reason: 'MISSING' | 'RECONCILIATION_REQUIRED';
          canEnter: boolean;
        }[] = [];
        let processed = 0;
        for (const workspace of workspaces.values()) {
          const { sheet, definition, context, fields } = workspace;
          if (!definition) continue;
          const required = definition.fields.filter(
            (field) =>
              field.requiredForFinal &&
              fields.get(field.id)?.readable &&
              (!filter.fieldId || filter.fieldId === field.id),
          );
          if (!required.length) continue;
          const rows = await this.sheets.rows(
            client,
            actor.schoolId,
            sheet.id,
            {
              filters: filter.studentId
                ? { studentIds: [filter.studentId] }
                : undefined,
              fieldIds: workspace.loadFields,
              take: 25001,
            },
          );
          processed += rows.length * required.length;
          if (rows.length > 25000 || processed > 1_000_000)
            throw new OfficialResultsError('scope.limit_exceeded');
          const date = currentRosterInstant(
            sheet.rosterAsOf,
            context.period.endsOn,
            context.period.school.schoolProfile?.timezone ?? 'UTC',
          );
          const placements = await this.roster.placements(
            client,
            context.period,
            date,
            rows.map((row) => row.studentId),
          );
          const visible = new Set(required.map((field) => field.id));
          const labels = new Map(
            required.map((field) => [field.id, field.label]),
          );
          for (const row of rows) {
            if (row.groupExempt || row.rosterState === 'CLOSED') continue;
            const current = placements.get(row.studentId) ?? [];
            const reconciled =
              row.rosterState === 'ELIGIBLE' &&
              (row.historicalPlacement
                ? current.length <= 1
                : current.length === 1 &&
                  current[0].id === row.enrollmentId &&
                  current[0].classroomId === sheet.classroomId);
            const projected = presentGradebookRow(
              row,
              definition,
              fields,
              visible,
              reconciled &&
                workspace.capabilities.edit.allowed &&
                (!row.historicalPlacement || workspace.mayEditHistorical),
            );
            for (const cell of projected.cells) {
              if (reconciled && cell.value.status !== 'MISSING') continue;
              items.push({
                id: row.id + ':' + cell.fieldId,
                sheetId: sheet.id,
                slotId: row.id,
                studentId: row.studentId,
                studentName: projected.student.displayName,
                enrollmentId: row.enrollmentId,
                fieldId: cell.fieldId,
                fieldLabel: labels.get(cell.fieldId)!,
                reason: reconciled ? 'MISSING' : 'RECONCILIATION_REQUIRED',
                canEnter:
                  reconciled && ('editable' in cell ? cell.editable : false),
              });
            }
          }
        }
        const page = presentResultPage(
          items
            .sort((a, b) => a.id.localeCompare(b.id))
            .filter((item) => !after || item.id > after),
          limit,
          (item) => item.id,
          scope,
          'missing',
          filter,
        );
        return {
          ...page,
          scope: { sheetIds: [...workspaces.keys()] },
          counts: {
            missingFields: items.filter((item) => item.reason === 'MISSING')
              .length,
            reconciliationFields: items.filter(
              (item) => item.reason === 'RECONCILIATION_REQUIRED',
            ).length,
            affectedSlots: new Set(items.map((item) => item.slotId)).size,
          },
        };
      },
      { timeout: 15_000 },
    );
  }

  history(surface: Surface, query: ResultAnalyticalQuery) {
    const actor = requireResultActor(surface);
    const { limit: requested, cursor, ...filter } = query;
    const scope = actor.schoolId + ':' + actor.actorId;
    const { limit, after } = readResultCursor(
      { limit: requested, cursor },
      scope,
      'history',
      filter,
    );
    if (after && !/^[a-f0-9-]{36}$/u.test(after))
      throw new ValidationDomainException('Invalid result history cursor');
    return this.commands.readSnapshot(
      async (client) => {
        const access = await this.auth.permissions(client, actor);
        this.auth.requirePermission(access, 'official_results.history.view');
        const workspaces = await this.authorizedWorkspaces(
          client,
          access,
          filter,
        );
        const schoolId = actor.schoolId;
        const ids = [...workspaces.keys()];
        const visible = new Map(
          [...workspaces].map(([id, workspace]) => [
            id,
            [...workspace.fields]
              .filter(
                ([fieldId, access]) =>
                  access.readable &&
                  (!filter.fieldId || filter.fieldId === fieldId),
              )
              .map(([fieldId]) => fieldId),
          ]),
        );
        const allowedFields = [...visible].flatMap(([sheetId, fieldIds]) =>
          fieldIds.length
            ? [{ slot: { sheetId }, fieldId: { in: fieldIds } }]
            : [],
        );
        const since = after ? { id: { gt: after } } : {};
        const rows = allowedFields.length
          ? await client.resultCellRevision.findMany({
              where: {
                schoolId,
                ...since,
                cell: {
                  schoolId,
                  ...(filter.studentId
                    ? { slot: { studentId: filter.studentId } }
                    : {}),
                  OR: allowedFields,
                },
                definition: {
                  fields: {
                    some: {
                      schoolId,
                      ...(surface === 'TEACHER'
                        ? { readRule: 'INHERIT_SHEET' }
                        : {}),
                    },
                  },
                },
              },
              orderBy: { id: 'asc' },
              take: limit + 1,
              select: {
                id: true,
                version: true,
                createdAt: true,
                authorId: true,
                operationId: true,
                source: true,
                before: true,
                after: true,
                cell: {
                  select: {
                    slotId: true,
                    fieldId: true,
                    slot: { select: { sheetId: true } },
                  },
                },
                definition: {
                  select: {
                    fields: { select: { fieldId: true, readRule: true } },
                  },
                },
              },
            })
          : [];
        const revisions = rows
          .filter(
            (row) =>
              surface !== 'TEACHER' ||
              row.definition.fields.some(
                (field) =>
                  field.fieldId === row.cell.fieldId &&
                  field.readRule === 'INHERIT_SHEET',
              ),
          )
          .flatMap((row) => {
            const old = resultValue.safeParse(row.before);
            const current = resultValue.safeParse(row.after);
            if (
              !old.success ||
              !current.success ||
              !historicallyVisible.has(current.data.status)
            )
              return [];
            return [
              {
                id: row.id,
                resourceId: row.cell.slotId,
                type: 'CELL' as const,
                action: row.source,
                occurredAt: row.createdAt.toISOString(),
                actorId: row.authorId,
                revision: row.version,
                sheetId: row.cell.slot.sheetId,
                fieldId: row.cell.fieldId,
                before: old.data,
                after: current.data,
                operationId: row.operationId,
              },
            ];
          });
        const definitions =
          filter.studentId || filter.fieldId
            ? []
            : (
                await client.resultSheetDefinitionVersion.findMany({
                  where: { schoolId, sheetId: { in: ids }, ...since },
                  take: limit + 1,
                  orderBy: { id: 'asc' },
                  select: {
                    id: true,
                    sheetId: true,
                    version: true,
                    createdById: true,
                    createdAt: true,
                  },
                })
              ).map((item) => ({
                id: item.id,
                resourceId: item.id,
                type: 'DEFINITION' as const,
                action: 'CREATE',
                occurredAt: item.createdAt.toISOString(),
                actorId: item.createdById,
                revision: item.version,
                sheetId: item.sheetId,
              }));
        const releases = filter.fieldId
          ? []
          : (
              await client.resultReleaseEvent.findMany({
                where: {
                  schoolId,
                  ...since,
                  publication: { candidate: { sheetId: { in: ids } } },
                  ...(filter.studentId
                    ? { slot: { studentId: filter.studentId } }
                    : {}),
                },
                take: limit + 1,
                orderBy: { id: 'asc' },
                include: {
                  publication: {
                    select: {
                      revision: true,
                      candidate: { select: { sheetId: true } },
                    },
                  },
                },
              })
            ).map((event) => ({
              id: event.id,
              resourceId: event.publicationId,
              type: 'PUBLICATION' as const,
              action: event.event,
              occurredAt: event.recordedAt.toISOString(),
              actorId: event.actorId,
              revision: event.publication.revision,
              sheetId: event.publication.candidate.sheetId,
            }));
        const decisions = filter.fieldId
          ? []
          : (
              await client.resultReviewDecision.findMany({
                where: {
                  schoolId,
                  ...since,
                  candidate: {
                    sheetId: { in: ids },
                    ...(filter.studentId
                      ? { slot: { studentId: filter.studentId } }
                      : {}),
                  },
                },
                take: limit + 1,
                orderBy: { id: 'asc' },
                select: {
                  id: true,
                  candidateId: true,
                  decision: true,
                  reviewerId: true,
                  decidedAt: true,
                  candidateRevision: true,
                  candidate: { select: { sheetId: true } },
                },
              })
            ).map((item) => ({
              id: item.id,
              resourceId: item.candidateId,
              type: 'REVIEW' as const,
              action: item.decision,
              occurredAt: item.decidedAt.toISOString(),
              actorId: item.reviewerId,
              revision: item.candidateRevision,
              sheetId: item.candidate.sheetId,
            }));
        const imports =
          filter.studentId || filter.fieldId
            ? []
            : (
                await client.resultImportExecutionUnit.findMany({
                  where: {
                    schoolId,
                    ...since,
                    sheetId: { in: ids },
                    execution: { batch: { creatorId: actor.actorId } },
                    status: { in: ['APPLIED', 'FAILED', 'CANCELLED'] },
                  },
                  take: limit + 1,
                  orderBy: { id: 'asc' },
                  select: {
                    id: true,
                    sheetId: true,
                    status: true,
                    updatedAt: true,
                    execution: {
                      select: { batchId: true, batchRevision: true },
                    },
                  },
                })
              ).map((item) => ({
                id: item.id,
                resourceId: item.execution.batchId,
                type: 'IMPORT' as const,
                action: item.status,
                occurredAt: item.updatedAt.toISOString(),
                actorId: actor.actorId,
                revision: item.execution.batchRevision,
                sheetId: item.sheetId,
              }));
        const items = [
          ...revisions,
          ...definitions,
          ...releases,
          ...decisions,
          ...imports,
        ].sort((a, b) => a.id.localeCompare(b.id));
        return presentResultPage(
          items,
          limit,
          (item) => item.id,
          scope,
          'history',
          filter,
        );
      },
      { timeout: 15_000 },
    );
  }

  private async authorizedWorkspaces(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    query: ResultAnalyticalQuery,
  ) {
    this.auth.requirePermission(access, 'official_results.sheets.view');
    const schoolId = access.actor.schoolId;
    const rows = await client.resultSheet.findMany({
      where: {
        schoolId,
        id: query.sheetId,
        reportingPeriodId: query.reportingPeriodId,
        classroomId: query.classroomId,
        groupId: query.groupId,
        ...(query.studentId
          ? { slots: { some: { studentId: query.studentId } } }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: 1001,
      select: { id: true },
    });
    if (rows.length > 1000)
      throw new OfficialResultsError('scope.limit_exceeded');
    const result = new Map<string, Workspace>();
    for (const { id } of rows) {
      try {
        const workspace = await this.gradebook.workspace(
          client,
          access,
          id,
          'VIEW',
          { write: false },
        );
        if (!query.fieldId || workspace.fields.get(query.fieldId)?.readable)
          result.set(id, workspace);
      } catch (error) {
        if (
          !(error instanceof NotFoundDomainException) &&
          (!(error instanceof OfficialResultsError) ||
            error.code !== 'official_results.scope.subject_unavailable')
        )
          throw error;
      }
    }
    if ((query.sheetId || query.fieldId || query.studentId) && !result.size)
      throw new NotFoundDomainException();
    return result;
  }
}

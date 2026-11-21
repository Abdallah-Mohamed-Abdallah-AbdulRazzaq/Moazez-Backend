import { Injectable } from '@nestjs/common';
import type { Prisma, ResultDraftChangeSource } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod/v4';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { OfficialResultsError } from '../domain/official-results.error';
import { currentRosterInstant } from '../domain/reporting-dates';
import {
  checkedResultValue,
  type ResultGridPatch,
} from '../domain/result-cell-operation';
import { resultContentDigest } from '../domain/result-content-digest';
import { resultFieldAccess } from '../domain/result-field-access';
import { storedCellValue, type ResultValue } from '../domain/result-value';
import { storedResultDefinition } from '../domain/sheet-definition-seed';
import {
  ResultAuthorizationRepository,
  type ResultPermissionCheck,
} from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import {
  ResultGradebookRepository,
  type GradebookRowFilters,
  type GradebookSheetFilters,
  type ResultDraftChange,
} from '../infrastructure/repositories/result-gradebook.repository';
import { ResultRosterRepository } from '../infrastructure/repositories/result-roster.repository';
import { requireResultActor } from './result-actor';
import {
  presentGradebookRow,
  presentResultField,
  presentResultSheet,
  printableDraftValue,
} from './result-gradebook.presenter';
import {
  presentResultPage,
  readResultCursor,
  type ResultListQuery,
} from './result-page';

type Surface = 'SCHOOL' | 'TEACHER';
type Workspace = Awaited<ReturnType<ResultGradebookService['workspace']>>;
type Row = ReturnType<typeof presentGradebookRow>;
type RowQuery = GradebookRowFilters &
  ResultListQuery & {
    selectedFieldIds?: string[];
    completeness?: 'COMPLETE' | 'PARTIAL';
    recordedState?: ResultValue['status'];
  };

function expectCursor(after: string | null): void {
  if (after && !z.uuid().safeParse(after).success)
    throw new ValidationDomainException('Invalid result cursor');
}

@Injectable()
export class ResultGradebookService {
  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly auth: ResultAuthorizationRepository,
    private readonly repository: ResultGradebookRepository,
    private readonly roster: ResultRosterRepository,
  ) {}

  list(surface: Surface, query: GradebookSheetFilters & ResultListQuery) {
    const actor = requireResultActor(surface);
    const { limit: requested, cursor, ...filters } = query;
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor);
      this.auth.requirePermission(access, 'official_results.sheets.view');
      const pageScope = actor.schoolId + ':' + actor.actorId;
      const { limit, after } = readResultCursor(
        { limit: requested, cursor },
        pageScope,
        'sheets',
        filters,
      );
      expectCursor(after);
      const sheets: ReturnType<typeof presentResultSheet>[] = [];
      let next = after;
      while (sheets.length <= limit) {
        const batch = await this.repository.list(
          client,
          actor.schoolId,
          filters,
          next,
          limit + 1,
        );
        for (const sheet of batch) {
          try {
            await this.auth.authorizedTarget(client, access, sheet, 'VIEW');
            sheets.push(presentResultSheet(sheet));
            if (sheets.length > limit) break;
          } catch (error) {
            if (
              !(error instanceof NotFoundDomainException) &&
              (!(error instanceof OfficialResultsError) ||
                error.code !== 'official_results.scope.subject_unavailable')
            )
              throw error;
          }
        }
        if (batch.length < limit + 1) break;
        next = batch[batch.length - 1].id;
      }
      return presentResultPage(
        sheets,
        limit,
        (sheet) => sheet.sheetId,
        pageScope,
        'sheets',
        filters,
      );
    });
  }

  detail(surface: Surface, sheetId: string) {
    const actor = requireResultActor(surface);
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor);
      const workspace = await this.workspace(client, access, sheetId, 'VIEW');
      return {
        ...presentResultSheet(workspace.sheet),
        capabilities: workspace.capabilities,
      };
    });
  }

  grid(surface: Surface, sheetId: string, query: RowQuery) {
    const actor = requireResultActor(surface);
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor);
      const workspace = await this.workspace(client, access, sheetId, 'VIEW');
      const { limit: requested, cursor, ...filters } = query;
      const pageScope = actor.schoolId + ':' + actor.actorId + ':' + sheetId;
      const { limit, after } = readResultCursor(
        { limit: requested, cursor },
        pageScope,
        'gradebook',
        filters,
      );
      expectCursor(after);
      const fields = (workspace.definition?.fields ?? []).filter(
        (field) => workspace.fields.get(field.id)?.readable,
      );
      const fieldIds = new Set(fields.map((field) => field.id));
      const selected = new Set(filters.selectedFieldIds ?? fieldIds);
      if ([...selected].some((id) => !fieldIds.has(id)))
        throw new NotFoundDomainException();

      const rows: Row[] = [];
      const asOf = currentRosterInstant(
        workspace.sheet.rosterAsOf,
        workspace.context.period.endsOn,
        workspace.context.period.school.schoolProfile?.timezone ?? 'UTC',
      );
      let next = after;
      while (rows.length <= limit) {
        const batch = await this.repository.rows(
          client,
          actor.schoolId,
          sheetId,
          {
            fieldIds: workspace.loadFields,
            filters,
            after: next,
            take: limit + 1,
          },
        );
        const current = await this.roster.placements(
          client,
          workspace.context.period,
          asOf,
          batch.map((record) => record.studentId),
        );
        for (const record of batch) {
          const placements = current.get(record.studentId) ?? [];
          const currentPlacement = record.historicalPlacement
            ? placements.length <= 1
            : placements.length === 1 &&
              placements[0].id === record.enrollmentId &&
              placements[0].classroomId === workspace.sheet.classroomId;
          const display =
            !currentPlacement && record.rosterState === 'ELIGIBLE'
              ? { ...record, rosterState: 'RECONCILIATION_REQUIRED' as const }
              : record;
          const editable =
            workspace.capabilities.edit.allowed &&
            display.rosterState === 'ELIGIBLE' &&
            !record.groupExempt &&
            (!record.historicalPlacement || workspace.mayEditHistorical);
          const row = presentGradebookRow(
            display,
            workspace.definition,
            workspace.fields,
            selected,
            editable,
          );
          if (
            (filters.completeness &&
              row.completeness !== filters.completeness) ||
            (filters.recordedState &&
              !row.cells.some(
                (cell) => cell.value.status === filters.recordedState,
              ))
          )
            continue;
          rows.push(row);
          if (rows.length > limit) break;
        }
        if (batch.length < limit + 1) break;
        next = batch[batch.length - 1].id;
      }
      return {
        ...presentResultSheet(workspace.sheet),
        capabilities: workspace.capabilities,
        projection: {
          audience: 'STAFF',
          actorMode: surface === 'TEACHER' ? 'TEACHER' : 'SCHOOL_MANAGEMENT',
        },
        definitions: fields
          .filter((field) => selected.has(field.id))
          .map((field) =>
            presentResultField(
              field,
              surface === 'SCHOOL' &&
                !workspace.fields.get(field.id)?.hiddenDependencies,
            ),
          ),
        rows: presentResultPage(
          rows,
          limit,
          (row) => row.slotId,
          pageScope,
          'gradebook',
          filters,
        ),
      };
    });
  }

  patch(
    surface: Surface,
    sheetId: string,
    input: ResultGridPatch,
    key?: string,
  ) {
    const actor = requireResultActor(surface);
    const operationId = randomUUID();
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor, {
        write: true,
      });
      const workspace = await this.workspace(client, access, sheetId, 'EDIT');
      const save = () =>
        this.mutate(client, access, workspace, input, operationId, 'GRID');
      if (key === undefined) return save();
      return this.commands.idempotent(
        client,
        actor,
        'grid.patch',
        key,
        { sheetId, ...input },
        save,
      );
    });
  }

  async workspace(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    sheetId: string,
    action: 'VIEW' | 'EDIT' | 'IMPORT' | 'EXPORT' | 'SUBMIT',
    contextOptions: {
      slotId?: string;
      releaseUnitId?: string;
      write?: boolean;
    } = {},
  ) {
    const write =
      contextOptions.write ?? ['EDIT', 'IMPORT', 'SUBMIT'].includes(action);
    const permission = {
      VIEW: 'sheets.view',
      EDIT: 'entries.manage',
      IMPORT: 'imports.manage',
      EXPORT: 'exports.create',
      SUBMIT: 'reviews.submit',
    }[action];
    this.auth.requirePermission(access, 'official_results.' + permission);
    const { actor } = access;
    const initial = await this.repository.sheet(
      client,
      actor.schoolId,
      sheetId,
    );
    const context = await this.auth.authorizedTarget(
      client,
      access,
      initial,
      action,
      { ...contextOptions, write },
    );
    const sheet = write
      ? await this.repository.sheet(client, actor.schoolId, sheetId, true)
      : initial;
    const definition = storedResultDefinition(
      sheet.draftDefinition?.configuration,
    );
    const accepted = storedResultDefinition(
      sheet.acceptedDefinition?.configuration,
    );
    const teacher = actor.userType === 'TEACHER';
    const grantsOnly =
      teacher && (!context.period.termId || !context.group.subjectId);
    const allowedActions = grantsOnly
      ? await this.auth.grantedActions(client, actor, sheet)
      : null;
    const allows = (permission: string, action?: string) =>
      access.permissions.has('official_results.' + permission) &&
      (!action ||
        !allowedActions ||
        [...allowedActions].some((grant) => grant === action));
    const open =
      context.period.status === 'OPEN' ||
      (write && Boolean(contextOptions.slotId && contextOptions.releaseUnitId));
    const canEdit = open && allows('entries.manage', 'EDIT');
    const capabilities = {
      edit: { allowed: canEdit },
      submit: { allowed: open && allows('reviews.submit', 'SUBMIT') },
      approve: {
        allowed:
          context.period.status !== 'ARCHIVED' && allows('reviews.approve'),
      },
      publish: {
        allowed:
          context.period.status !== 'ARCHIVED' &&
          allows('publications.publish', 'PUBLISH') &&
          !context.settings.publicationSuspended &&
          (!teacher ||
            context.settings.firstPublication === 'DIRECT_IF_AUTHORIZED'),
      },
      import: { allowed: open && allows('imports.manage', 'IMPORT') },
      export: { allowed: allows('exports.create', 'EXPORT') },
      requestCorrection: {
        allowed: allows('corrections.request', 'REQUEST_CORRECTION'),
      },
      releaseCorrection: {
        allowed:
          allows('publications.correct', 'PUBLISH_CORRECTION') &&
          allows('publications.publish') &&
          !context.settings.publicationSuspended &&
          (!teacher ||
            context.settings.correctionPublication === 'DIRECT_IF_AUTHORIZED'),
      },
    };
    const grants = await this.auth.fieldGrants(client, actor, sheet, write);
    const fields = definition
      ? resultFieldAccess({ definition, accepted, teacher, grants, canEdit })
      : new Map();
    const loadFields = (definition?.fields ?? [])
      .filter(
        (field) =>
          field.kind !== 'CALCULATED' &&
          (fields.get(field.id)?.readable ||
            definition!.releaseUnits.some((unit) =>
              unit.derivedDisclosure.some(
                (rule) =>
                  fields.get(rule.outputFieldId)?.readable &&
                  rule.privateOperandFieldIds.includes(field.id),
              ),
            )),
      )
      .map((field) => field.id);
    const mayEditHistorical =
      !teacher ||
      (await this.auth.hasHistoricalEditGrant(client, actor, sheet, write));
    return {
      sheet,
      context,
      definition,
      accepted,
      fields,
      loadFields,
      capabilities,
      mayEditHistorical,
    };
  }

  async mutate(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    workspace: Workspace,
    input: ResultGridPatch,
    operationId: string,
    source: ResultDraftChangeSource,
  ) {
    const { sheet, definition, context, fields, mayEditHistorical } = workspace;
    const { actor } = access;
    if (
      !definition ||
      input.expectedDefinitionVersionId !== sheet.draftDefinitionVersionId
    ) {
      throw new OfficialResultsError('schema.stale');
    }
    if (input.expectedSheetRevision !== sheet.sheetRevision)
      throw new OfficialResultsError('revision.stale');
    const operations = input.operations;
    if (
      operations.length >
      context.settings.importLimits.maxChangedCellsPerAtomicSheetUnit
    ) {
      throw new OfficialResultsError('scope.limit_exceeded');
    }
    const keys = operations.map((item) => item.slotId + ':' + item.fieldId);
    if (new Set(keys).size !== keys.length)
      throw new ValidationDomainException('Duplicate result cell operation');
    const slotIds = [...new Set(operations.map((item) => item.slotId))];
    const found = await this.repository.rows(client, actor.schoolId, sheet.id, {
      slots: slotIds,
      fieldIds: workspace.loadFields,
      take: slotIds.length,
    });
    if (found.length !== slotIds.length) throw new NotFoundDomainException();
    const targetFields = new Map(
      definition.fields.map((field) => [field.id, field]),
    );
    for (const item of operations) {
      if (
        !fields.get(item.fieldId)?.editable ||
        !targetFields.has(item.fieldId)
      ) {
        throw new OfficialResultsError('schema.protected');
      }
    }
    const now = currentRosterInstant(
      sheet.rosterAsOf,
      context.period.endsOn,
      context.period.school.schoolProfile?.timezone ?? 'UTC',
    );
    const placement = await this.roster.placements(
      client,
      context.period,
      now,
      found.map((row) => row.studentId),
      true,
    );
    for (const row of found) {
      const current = placement.get(row.studentId) ?? [];
      if (
        row.rosterState !== 'ELIGIBLE' ||
        row.groupExempt ||
        (row.historicalPlacement
          ? !mayEditHistorical || current.length > 1
          : current.length !== 1 ||
            current[0].id !== row.enrollmentId ||
            current[0].classroomId !== sheet.classroomId)
      ) {
        throw new OfficialResultsError('roster.changed', { slotId: row.id });
      }
    }
    // Re-read the versions after waiting for current academic placement locks.
    const rows = await this.repository.rows(client, actor.schoolId, sheet.id, {
      slots: slotIds,
      fieldIds: workspace.loadFields,
      take: slotIds.length,
    });
    const current = new Map(
      rows.flatMap((row) =>
        row.cells.map(
          (cell) => [cell.slotId + ':' + cell.fieldId, cell] as const,
        ),
      ),
    );
    const changes: ResultDraftChange[] = [];
    const issues: { slotId: string; fieldId: string; code: string }[] = [];
    const conflicts: {
      slotId: string;
      fieldId: string;
      currentVersion: number;
      currentValue: ResultValue;
      proposed: unknown;
    }[] = [];
    for (const item of operations) {
      const field = targetFields.get(item.fieldId)!;
      const prior = current.get(item.slotId + ':' + item.fieldId);
      const before = prior
        ? printableDraftValue(field, storedCellValue(prior))
        : { status: 'MISSING' as const };
      if ((prior?.version ?? 0) !== item.expectedCellVersion) {
        conflicts.push({
          slotId: item.slotId,
          fieldId: item.fieldId,
          currentVersion: prior?.version ?? 0,
          currentValue: before,
          proposed:
            item.operation === 'SET' ? item.value : { status: 'MISSING' },
        });
        continue;
      }
      try {
        const after = checkedResultValue(field, item);
        const reason = item.reason ?? input.changeReason;
        if (
          resultContentDigest(before) !== resultContentDigest(after) ||
          (reason !== undefined && reason !== prior?.stateReason)
        ) {
          changes.push({
            slotId: item.slotId,
            field,
            expectedVersion: item.expectedCellVersion,
            before,
            after,
            reason,
          });
        }
      } catch (error) {
        if (!(error instanceof DomainException)) throw error;
        issues.push({
          slotId: item.slotId,
          fieldId: item.fieldId,
          code: error.code,
        });
      }
    }
    if (conflicts.length)
      throw new OfficialResultsError('cell.conflict', { conflicts });
    if (issues.length)
      throw new OfficialResultsError('cell.invalid_value', { issues });
    if (!changes.length)
      return {
        sheetId: sheet.id,
        sheetRevision: sheet.sheetRevision,
        dataGeneration: sheet.dataGeneration,
        changedCells: [],
        calculatedOutputs: [],
        operationId,
      };
    const stored = await this.repository.apply(client, actor, sheet, changes);
    if (stored.length !== changes.length)
      throw new OfficialResultsError('cell.conflict');
    const applied = new Map(
      stored.map((cell) => [cell.slotId + ':' + cell.fieldId, cell]),
    );
    const changeset = changes.map((change) => ({
      change,
      cell: applied.get(change.slotId + ':' + change.field.id)!,
    }));
    await client.resultCellRevision.createMany({
      data: changeset.map(({ cell, change }) => ({
        schoolId: actor.schoolId,
        cellId: cell.id,
        definitionVersionId: sheet.draftDefinitionVersionId,
        version: cell.version,
        authorId: actor.actorId,
        operationId,
        source,
        reason: change.reason,
        before: change.before,
        after: change.after,
      })),
    });
    const changedSlotIds = [...new Set(stored.map((cell) => cell.slotId))];
    const updated = await this.repository.bump(
      client,
      actor.schoolId,
      sheet.id,
      changedSlotIds,
    );
    const revisions = new Map(
      updated.updatedSlots.map((slot) => [slot.id, slot.revision]),
    );
    const recomputed = await this.repository.rows(
      client,
      actor.schoolId,
      sheet.id,
      {
        slots: changedSlotIds,
        fieldIds: workspace.loadFields,
        take: changedSlotIds.length,
      },
    );
    const visible = new Set(
      definition.fields
        .filter((field) => fields.get(field.id)?.readable)
        .map((field) => field.id),
    );
    const calculatedOutputs = recomputed.flatMap((row) =>
      presentGradebookRow(row, definition, fields, visible, false)
        .cells.filter((cell) => 'calculationStatus' in cell)
        .map((cell) => ({
          ...cell,
          slotId: row.id,
          slotRevision: row.revision,
        })),
    );
    await this.commands.audit(
      client,
      actor,
      'grid.patch',
      'result_sheet',
      sheet.id,
      {
        operationId,
        source,
        changes: changes.length,
        ...(input.changeReason ? { reason: input.changeReason } : {}),
      },
    );
    return {
      sheetId: sheet.id,
      ...updated.sheet,
      operationId,
      changedCells: changeset.map(({ cell, change }) => ({
        slotId: cell.slotId,
        fieldId: cell.fieldId,
        value: change.after,
        cellVersion: cell.version,
        slotRevision: revisions.get(cell.slotId)!,
      })),
      calculatedOutputs,
    };
  }
}

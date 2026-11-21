import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { OfficialResultsError } from '../domain/official-results.error';
import { currentRosterInstant } from '../domain/reporting-dates';
import { resultContentDigest } from '../domain/result-content-digest';
import type { ImportUnit } from '../domain/result-import.contract';
import { storedCellValue } from '../domain/result-value';
import {
  ResultAuthorizationRepository,
  type ResultPermissionCheck,
} from '../infrastructure/repositories/result-authorization.repository';
import { ResultGradebookRepository } from '../infrastructure/repositories/result-gradebook.repository';
import { ResultRosterRepository } from '../infrastructure/repositories/result-roster.repository';
import { printableDraftValue } from './result-gradebook.presenter';
import { ResultGradebookService } from './result-gradebook.service';

@Injectable()
export class ResultImportCommitGate {
  constructor(
    private readonly auth: ResultAuthorizationRepository,
    private readonly gradebook: ResultGradebookService,
    private readonly sheets: ResultGradebookRepository,
    private readonly roster: ResultRosterRepository,
  ) {}

  async lockAndVerify(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    unit: ImportUnit,
  ) {
    const { actor } = access;
    const expected = unit.context;
    this.auth.requirePermission(access, 'official_results.entries.manage');
    const first = expected.slots[0];
    const window = expected.correctionUnitId;
    const workspace = await this.gradebook.workspace(
      client,
      access,
      expected.sheetId,
      'IMPORT',
      {
        write: true,
        ...(first && window
          ? { slotId: first.slotId, releaseUnitId: window }
          : {}),
      },
    );
    const { sheet, definition, context } = workspace;
    await this.auth.authorizedTarget(client, access, sheet, 'VIEW');
    await this.auth.authorizedTarget(client, access, sheet, 'EDIT', {
      write: true,
      ...(first && window
        ? { slotId: first.slotId, releaseUnitId: window }
        : {}),
    });
    if (
      !definition ||
      sheet.draftDefinitionVersionId !== expected.draftDefinitionVersionId
    )
      throw new OfficialResultsError('schema.stale');
    if (context.policyRevision !== expected.policyRevision)
      throw new OfficialResultsError('policy.stale');
    if (
      sheet.classroomId !== expected.classroomId ||
      sheet.groupId !== expected.groupId ||
      sheet.reportingPeriodId !== expected.reportingPeriodId ||
      sheet.sheetRevision !== expected.sheetRevision ||
      sheet.rosterGeneration !== expected.rosterRevision
    )
      throw new OfficialResultsError('preview.stale');
    if (
      unit.changes.length >
      context.settings.importLimits.maxChangedCellsPerAtomicSheetUnit
    )
      throw new OfficialResultsError('scope.limit_exceeded');
    const fields = new Map(definition.fields.map((field) => [field.id, field]));
    if (
      unit.changes.some(
        (change) =>
          !workspace.fields.get(change.fieldId)?.editable ||
          (window && fields.get(change.fieldId)?.releaseUnitId !== window),
      )
    )
      throw new NotFoundDomainException();
    if (window && context.period.status !== 'OPEN') {
      for (const slot of expected.slots.slice(1)) {
        await this.auth.authorizedTarget(client, access, sheet, 'IMPORT', {
          write: true,
          slotId: slot.slotId,
          releaseUnitId: window,
        });
      }
    }
    const targets = [...new Set(expected.slots.map((slot) => slot.slotId))];
    const found = await this.sheets.rows(client, actor.schoolId, sheet.id, {
      slots: targets,
      fieldIds: [
        ...new Set(unit.validationReadSet.map((cell) => cell.fieldId)),
      ],
      take: targets.length,
    });
    if (found.length !== targets.length)
      throw new OfficialResultsError('roster.changed');
    const instant = currentRosterInstant(
      sheet.rosterAsOf,
      context.period.endsOn,
      context.period.school.schoolProfile?.timezone ?? 'UTC',
    );
    const placement = await this.roster.placements(
      client,
      context.period,
      instant,
      found.map((row) => row.studentId),
      true,
    );
    const source = new Map(expected.slots.map((slot) => [slot.slotId, slot]));
    const cells = new Map<string, (typeof found)[number]['cells'][number]>();
    for (const row of found) {
      const old = source.get(row.id)!;
      const now = placement.get(row.studentId) ?? [];
      if (
        row.rosterState !== 'ELIGIBLE' ||
        row.groupExempt ||
        row.enrollmentId !== old.enrollmentId ||
        row.placementRevision !== old.placementRevision ||
        (row.historicalPlacement
          ? !workspace.mayEditHistorical || now.length > 1
          : now.length !== 1 ||
            now[0].id !== row.enrollmentId ||
            now[0].classroomId !== sheet.classroomId)
      )
        throw new OfficialResultsError('roster.changed');
      for (const cell of row.cells)
        cells.set(cell.slotId + ':' + cell.fieldId, cell);
    }
    for (const item of unit.validationReadSet) {
      const cell = cells.get(item.slotId + ':' + item.fieldId);
      const field = fields.get(item.fieldId);
      if (!field) throw new OfficialResultsError('schema.stale');
      const live = cell
        ? printableDraftValue(field, storedCellValue(cell))
        : { status: 'MISSING' };
      if (
        (cell?.version ?? 0) !== item.expectedCellVersion ||
        resultContentDigest(item.value) !== resultContentDigest(live)
      )
        throw new OfficialResultsError('cell.conflict');
    }
    return workspace;
  }

  apply(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    workspace: Awaited<ReturnType<ResultImportCommitGate['lockAndVerify']>>,
    unit: ImportUnit,
    operationId: string,
  ) {
    return this.gradebook.mutate(
      client,
      access,
      workspace,
      {
        expectedDefinitionVersionId: unit.context.draftDefinitionVersionId,
        expectedSheetRevision: unit.context.sheetRevision,
        operations: unit.changes.map((item) => {
          const target = {
            slotId: item.slotId,
            fieldId: item.fieldId,
            expectedCellVersion: item.expectedCellVersion,
          };
          return item.operation === 'CLEAR'
            ? { ...target, operation: item.operation, reason: item.reason }
            : {
                ...target,
                operation: item.operation,
                value: item.value,
                reason: item.reason,
              };
        }),
      },
      operationId,
      'IMPORT',
    );
  }
}

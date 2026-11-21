import { randomUUID } from 'node:crypto';
import { evaluateResultFields } from './result-calculation';
import { fieldHeaders } from './result-csv';
import type { ResultDefinition } from './result-definition';
import type { ExportManifest } from './result-export.contract';
import {
  mergeResultImport,
  normalizeImportValue,
  parseImportCommand,
  type RequestedValue,
} from './result-import-commands';
import {
  headerLocations,
  protectedRowMatches,
  type ImportRecord,
  type TabularImport,
} from './result-import-csv';
import {
  blankImportSummary,
  importIssueCatalog,
  importIssueMessagesAr,
  type ImportChange,
  type ImportCorrection,
  type ImportFinding,
  type ImportIssueSuffix,
  type ImportOptions,
  type ImportReadCell,
  type ImportRowSummary,
  type ImportSheetBinding,
  type ImportUnit,
} from './result-import.contract';
import type { ResultValue } from './result-value';

const missing = { status: 'MISSING' } as const;
type CurrentCell = { value: ResultValue; version: number };
export type CurrentImportSheet = {
  binding: ImportSheetBinding;
  definition: ResultDefinition;
  rows: Map<string, Map<string, CurrentCell>>;
  maxChanges: number;
  failures: Map<string, 'roster_changed' | 'target_locked'>;
  newlyEligibleCount: number;
};
type CompareInput = {
  parsed: TabularImport;
  manifest: ExportManifest;
  current: Map<string, CurrentImportSheet>;
  failures: Map<string, string>;
  options: ImportOptions;
  corrections: ImportCorrection[];
};

export function importIssue(
  issue: ImportIssueSuffix | 'schema_stale',
  severity: ImportFinding['severity'] = 'ERROR',
  location: Partial<ImportFinding> = {},
): ImportFinding {
  return {
    id: randomUUID(),
    code:
      issue === 'schema_stale'
        ? 'official_results.schema.stale'
        : 'official_results.import.' + issue,
    severity,
    message:
      issue === 'schema_stale'
        ? 'The current result definition no longer matches this export'
        : importIssueCatalog[issue],
    messageAr:
      issue === 'schema_stale'
        ? 'تعريف كشف النتائج الحالي مختلف عن التصدير'
        : importIssueMessagesAr[issue],
    action:
      issue === 'roster_changed' ||
      issue === 'schema_stale' ||
      issue === 'roster_added'
        ? 'REEXPORT'
        : issue === 'cell_conflict'
          ? 'REVIEW_CONFLICT'
          : issue === 'draft_incomplete'
            ? 'REVIEW_DRAFT'
            : 'CORRECT_SOURCE',
    ...location,
  };
}

function cellKey(rowRef: string, fieldId: string) {
  return rowRef + ':' + fieldId;
}

function affectedDependencies(
  definition: ResultDefinition,
  changes: ImportChange[],
  values: Map<string, ResultValue>,
) {
  const changed = new Set(changes.map((change) => change.fieldId));
  const computed = new Map(definition.fields.map((field) => [field.id, field]));
  const cache = new Map<string, Set<string>>();
  const manualInputs = (fieldId: string): Set<string> => {
    const cached = cache.get(fieldId);
    if (cached) return cached;
    const operands = computed.get(fieldId)?.formula?.operands;
    const result = new Set(
      operands
        ? operands.flatMap((operand) => [...manualInputs(operand.fieldId)])
        : [fieldId],
    );
    cache.set(fieldId, result);
    return result;
  };
  const units = new Set(
    changes.map((change) => computed.get(change.fieldId)?.releaseUnitId),
  );
  const candidates = definition.fields.filter(
    (field) =>
      (field.requiredForFinal && units.has(field.releaseUnitId)) ||
      (field.formula &&
        [...manualInputs(field.id)].some((input) => changed.has(input))),
  );
  const read = new Set([
    ...changed,
    ...candidates.flatMap((field) => [...manualInputs(field.id)]),
  ]);
  const evaluated = evaluateResultFields(definition, values);
  const incomplete = candidates.some(
    (field) =>
      field.requiredForFinal &&
      (evaluated.get(field.id)?.value ?? values.get(field.id) ?? missing)
        .status === 'MISSING',
  );
  return { read, incomplete };
}

export function compareImport(input: CompareInput) {
  const { parsed, manifest, current, failures, options } = input;
  const summary = blankImportSummary();
  const issues: ImportFinding[] = [];
  const rows: ImportRowSummary[] = [];
  const units = new Map<string, ImportUnit>();
  const manifestRows = new Map(manifest.rows.map((row) => [row.rowRef, row]));
  const sheetIds = new Set(manifest.sheets.map((sheet) => sheet.id));
  const selected = new Set(options.selectedSheetIds ?? sheetIds);
  const invalid = new Set<number>();
  const warned = new Set<number>();
  const seen = new Set<string>();
  const warnings: string[] = [];
  function add(finding: ImportFinding) {
    const number = finding.location?.record;
    const included = !finding.sheetId || selected.has(finding.sheetId);
    if (finding.severity === 'ERROR' || finding.severity === 'CONFLICT') {
      if (number !== undefined && number > 1) invalid.add(number);
      if (included) summary.blockingIssues++;
    }
    if (finding.severity === 'WARNING') {
      if (number !== undefined) warned.add(number);
      if (included) {
        summary.warningIssues++;
        if (issues.length < 10_000) warnings.push(finding.id);
      }
    }
    if (issues.length < 10_000) issues.push(finding);
    else summary.findingsTruncated = true;
  }
  for (const sheetId of selected)
    if (!sheetIds.has(sheetId)) add(importIssue('unknown_row'));
  for (const sheet of manifest.sheets) {
    const active = current.get(sheet.id);
    if (!active) {
      const failure = failures.get(sheet.id) ?? 'target_locked';
      add(
        importIssue(failure as 'schema_stale' | 'target_locked', 'ERROR', {
          sheetId: sheet.id,
        }),
      );
      continue;
    }
    units.set(sheet.id, {
      context: { ...active.binding, slots: [] },
      changes: [],
      validationReadSet: [],
      status: selected.has(sheet.id) ? 'NO_CHANGES' : 'EXCLUDED',
    });
    if (active.newlyEligibleCount > 0)
      add(importIssue('roster_added', 'WARNING', { sheetId: sheet.id }));
  }
  const columns = headerLocations(parsed, manifest);
  for (const header of columns.issues)
    add(
      importIssue(header.issue, 'ERROR', {
        location: { record: 1, column: header.column },
      }),
    );
  const byCorrection = new Map(
    input.corrections.map((item) => [cellKey(item.rowRef, item.fieldId), item]),
  );
  const reasons = new Map(
    (options.reasons ?? []).map((item) => [
      cellKey(item.rowRef, item.fieldId),
      item.reason,
    ]),
  );
  const pendingCorrection = new Set(byCorrection.keys());
  const pendingReason = new Set(reasons.keys());
  const fields = manifest.fields.map((field) => ({
    field,
    positions: fieldHeaders(field, false).map(
      (header) => columns.positions.get(header)!,
    ),
  }));

  function examine(record: ImportRecord): ImportRowSummary {
    const location = { record: record.record, line: record.line };
    const basic = {
      ...location,
      status: 'INVALID' as const,
      changedCells: 0,
      unchangedCells: 0,
    };
    if (columns.issues.length) {
      invalid.add(record.record);
      return basic;
    }
    const rowRef = parsed.decodeText(
      record.cells[columns.positions.get('row_ref')!],
    );
    const exported = manifestRows.get(rowRef);
    if (!exported) {
      add(importIssue('unknown_row', 'ERROR', { location }));
      return basic;
    }
    const slotId = exported.identity.slot_ref;
    const sheetId = exported.identity.sheet_ref;
    const located = { rowRef, sheetId, location };
    const row = { ...basic, rowRef, sheetId, slotId };
    if (seen.has(rowRef)) {
      add(importIssue('duplicate_row', 'ERROR', located));
      return row;
    }
    seen.add(rowRef);
    if (
      !protectedRowMatches(
        parsed,
        record,
        columns.positions,
        exported.protectedValues,
      )
    ) {
      add(importIssue('identity_changed', 'ERROR', located));
      return row;
    }
    const live = current.get(sheetId);
    const unit = units.get(sheetId);
    const currentValues = live?.rows.get(slotId);
    if (!currentValues || !unit || !live) {
      const failure =
        live?.failures.get(slotId) ?? failures.get(sheetId) ?? 'target_locked';
      add(
        importIssue(
          failure as 'schema_stale' | 'target_locked' | 'roster_changed',
          'ERROR',
          located,
        ),
      );
      return row;
    }
    const baselines = new Map(
      exported.base.map((cell) => [cell.fieldId, cell.value]),
    );
    const planned: ImportChange[] = [];
    const included = selected.has(sheetId);
    for (const { field, positions } of fields) {
      const [valueColumn, stateColumn] = positions;
      const correctionKey = cellKey(rowRef, field.id);
      const correction = byCorrection.get(correctionKey);
      pendingCorrection.delete(correctionKey);
      pendingReason.delete(correctionKey);
      const requested: RequestedValue = !correction
        ? parseImportCommand(
            field,
            record.cells[valueColumn],
            record.cells[stateColumn],
            parsed.decodeText,
          )
        : correction.operation === 'CLEAR'
          ? { kind: 'CLEAR', value: missing }
          : normalizeImportValue(field, correction.value);
      const target = {
        ...located,
        fieldId: field.id,
        location: { ...location, column: valueColumn + 1 },
      };
      if (requested.kind === 'ISSUE') {
        add(importIssue(requested.issue, 'ERROR', target));
        continue;
      }
      if (requested.kind === 'KEEP') {
        row.unchangedCells++;
        continue;
      }
      if (requested.normalized)
        add(importIssue('normalized_input', 'INFO', target));
      const baseline = baselines.get(field.id) ?? missing;
      const saved = currentValues.get(field.id) ?? {
        value: missing,
        version: 0,
      };
      const incoming = requested.value;
      if (
        correction?.expectedCellVersion !== undefined &&
        correction.expectedCellVersion !== saved.version
      ) {
        add(importIssue('preview_stale', 'CONFLICT', target));
        if (included) summary.conflictingCells++;
        continue;
      }
      const merge =
        correction?.expectedCellVersion === undefined
          ? mergeResultImport(baseline, incoming, saved.value)
          : 'APPLY';
      if (
        merge === 'KEEP_CURRENT' ||
        merge === 'CONVERGED' ||
        (correction?.expectedCellVersion !== undefined &&
          mergeResultImport(saved.value, incoming, saved.value) ===
            'KEEP_CURRENT')
      ) {
        row.unchangedCells++;
        continue;
      }
      if (merge === 'CONFLICT') {
        if (included) summary.conflictingCells++;
        add(
          importIssue('cell_conflict', 'CONFLICT', {
            ...target,
            comparison: {
              baseline,
              incoming,
              current: saved.value,
              currentVersion: saved.version,
            },
          }),
        );
        continue;
      }
      const reason =
        correction?.reason ??
        reasons.get(correctionKey) ??
        (requested.kind === 'CLEAR' ? options.clearReason : undefined);
      if (requested.kind === 'CLEAR' && !reason) {
        add(importIssue('clear_reason_required', 'ERROR', target));
        continue;
      }
      if (requested.kind === 'CLEAR')
        add(importIssue('clear_acknowledgment', 'WARNING', target));
      if (
        requested.kind === 'SET' &&
        field.stateReasonRequired.includes(incoming.status) &&
        !reason
      ) {
        add(importIssue('status_reason_required', 'ERROR', target));
        continue;
      }
      const context = {
        sheetId,
        rowRef,
        slotId,
        fieldId: field.id,
        expectedCellVersion: saved.version,
        before: saved.value,
        after: incoming,
      };
      planned.push(
        requested.kind === 'CLEAR'
          ? { ...context, operation: 'CLEAR', reason: reason! }
          : {
              ...context,
              operation: 'SET',
              value: incoming,
              ...(reason ? { reason } : {}),
            },
      );
    }
    const status = !included
      ? 'EXCLUDED'
      : invalid.has(record.record)
        ? 'INVALID'
        : 'VALID';
    if (status !== 'VALID') return { ...row, status };
    row.changedCells = planned.length;
    if (planned.length) {
      const values = new Map(
        [...currentValues].map(([id, state]) => [id, state.value]),
      );
      for (const change of planned) values.set(change.fieldId, change.after);
      const dependencies = affectedDependencies(
        live.definition,
        planned,
        values,
      );
      if (dependencies.incomplete)
        add(importIssue('draft_incomplete', 'WARNING', located));
      unit.changes.push(...planned);
      unit.context.slots.push({
        slotId,
        placementRevision: exported.placementRevision,
        enrollmentId: exported.identity.enrollment_ref,
      });
      for (const fieldId of dependencies.read) {
        const saved = currentValues.get(fieldId) ?? {
          value: missing,
          version: 0,
        };
        unit.validationReadSet.push({
          sheetId,
          slotId,
          fieldId,
          expectedCellVersion: saved.version,
          value: saved.value,
        });
      }
    }
    return { ...row, status };
  }
  for (const record of parsed.records) rows.push(examine(record));
  if (pendingCorrection.size || pendingReason.size)
    add(importIssue('unknown_row'));
  for (const [sheetId, unit] of units) {
    if (!selected.has(sheetId)) continue;
    const threshold = current.get(sheetId)!.maxChanges;
    if (unit.changes.length > threshold)
      add(importIssue('limit_exceeded', 'ERROR', { sheetId }));
    unit.status = issues.some(
      (item) =>
        item.sheetId === sheetId &&
        (item.severity === 'ERROR' || item.severity === 'CONFLICT'),
    )
      ? 'BLOCKED'
      : unit.changes.length
        ? 'READY'
        : 'NO_CHANGES';
    unit.changes.sort(
      (a, b) =>
        a.slotId.localeCompare(b.slotId) || a.fieldId.localeCompare(b.fieldId),
    );
    unit.validationReadSet.sort(
      (a, b) =>
        a.slotId.localeCompare(b.slotId) || a.fieldId.localeCompare(b.fieldId),
    );
    unit.context.slots.sort((a, b) => a.slotId.localeCompare(b.slotId));
  }
  Object.assign(summary, {
    parsedDataRows: rows.length,
    invalidRows: invalid.size,
    validRows: rows.length - invalid.size,
    rowsWithWarnings: warned.size,
    omittedRows: manifest.rows.length - seen.size,
    selectedSheets: [...selected].filter((id) => sheetIds.has(id)).length,
    selectedSlots: new Set(
      rows
        .filter((row) => row.slotId && row.sheetId && selected.has(row.sheetId))
        .map((row) => row.slotId),
    ).size,
    selectedEditableFields: manifest.fields.length,
    changedCells: [...units.values()].reduce(
      (sum, unit) => sum + unit.changes.length,
      0,
    ),
    unchangedCells: rows
      .filter((row) => row.status === 'VALID')
      .reduce((sum, row) => sum + row.unchangedCells, 0),
  });
  return {
    summary,
    issues,
    rows,
    units: [...units.values()],
    warningIds: warnings.sort(),
    selectedSheetIds: [...selected].sort(),
  };
}

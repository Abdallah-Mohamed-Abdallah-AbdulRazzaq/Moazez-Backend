import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  ResultExport,
  ResultImportBatch,
  ResultImportSource,
} from '@prisma/client';
import { z } from 'zod/v4';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../common/exceptions/domain-exception';
import { currentRosterInstant } from '../domain/reporting-dates';
import type {
  ExportManifest,
  ExportSheetContext,
} from '../domain/result-export.contract';
import {
  parseResultCsv,
  declaredExportRef,
  type TabularImport,
} from '../domain/result-import-csv';
import {
  compareImport,
  importIssue,
  type CurrentImportSheet,
} from '../domain/result-import-diff';
import {
  blankImportSummary,
  ResultImportFileError,
  type ImportCorrection,
  type ImportOptions,
  type ImportReviewBinding,
} from '../domain/result-import.contract';
import { platformResultLimits } from '../domain/result-policy';
import { parseResultsXlsx } from '../domain/result-xlsx-import';
import { storedCellValue } from '../domain/result-value';
import {
  ResultAuthorizationRepository,
  type ResultPermissionCheck,
} from '../infrastructure/repositories/result-authorization.repository';
import { ResultGradebookRepository } from '../infrastructure/repositories/result-gradebook.repository';
import { ResultRosterRepository } from '../infrastructure/repositories/result-roster.repository';
import { exportSummary } from './result-export-plan.service';
import { ResultExportService } from './result-export.service';
import { printableDraftValue } from './result-gradebook.presenter';
import { ResultGradebookService } from './result-gradebook.service';

type Managed = 'VIEW' | 'IMPORT';
type Workspace = Awaited<ReturnType<ResultGradebookService['workspace']>>;
type Validation = ReturnType<typeof compareImport> & {
  status: 'READY_TO_CONFIRM' | 'NO_CHANGES' | 'CORRECTIONS_REQUIRED';
  exportRef: string | null;
  permissionBinding: ImportReviewBinding['fields'];
};

function invalidValidation(
  issue: ConstructorParameters<typeof ResultImportFileError>[0],
): Validation {
  return {
    summary: { ...blankImportSummary(), blockingIssues: 1 },
    status: 'CORRECTIONS_REQUIRED',
    exportRef: null,
    permissionBinding: [],
    issues: [importIssue(issue)],
    rows: [],
    units: [],
    warningIds: [],
    selectedSheetIds: [],
  };
}

@Injectable()
export class ResultImportValidationService {
  constructor(
    private readonly auth: ResultAuthorizationRepository,
    private readonly exportService: ResultExportService,
    private readonly gradebook: ResultGradebookService,
    private readonly sheets: ResultGradebookRepository,
    private readonly roster: ResultRosterRepository,
  ) {}

  async assertExportScope(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    exportId: string,
    action: Managed,
  ) {
    this.auth.requirePermission(
      access,
      'official_results.imports.' + (action === 'IMPORT' ? 'manage' : 'view'),
    );
    const row = await client.resultExport.findFirst({
      where: { schoolId: access.actor.schoolId, id: exportId },
    });
    if (!row) throw new NotFoundDomainException();
    const summary = row.summary as unknown as ReturnType<typeof exportSummary>;
    const workspaces: Workspace[] = [];
    for (const entry of summary.sheets) {
      try {
        workspaces.push(
          await this.openSheet(client, access, entry.sheetId, action),
        );
      } catch (error) {
        if (
          !(error instanceof NotFoundDomainException) &&
          (!(error instanceof DomainException) ||
            error.code !== 'official_results.scope.subject_unavailable')
        )
          throw error;
      }
    }
    if (!workspaces.length) throw new NotFoundDomainException();
    return {
      row,
      maxFileSize: Math.max(
        ...workspaces.map(
          (work) => work.context.settings.importLimits.maxUploadBytes,
        ),
      ),
      retentionDays: Math.min(
        ...workspaces.map(
          (work) => work.context.settings.temporaryFileRetentionDays,
        ),
      ),
    };
  }

  async assertReviewScope(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    batch: ResultImportBatch,
    binding: ImportReviewBinding | null,
    action: Managed,
  ) {
    this.auth.requirePermission(
      access,
      'official_results.imports.' + (action === 'IMPORT' ? 'manage' : 'view'),
    );
    if (!binding?.fields.length) {
      await this.assertExportScope(client, access, batch.exportId, action);
      return;
    }
    for (const unit of binding.fields) {
      const current = await this.openSheet(
        client,
        access,
        unit.sheetId,
        action,
      );
      if (
        unit.fieldIds.some((fieldId) => !current.fields.get(fieldId)?.readable)
      )
        throw new NotFoundDomainException();
    }
  }

  private async openSheet(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    id: string,
    action: Managed,
  ) {
    const work = await this.gradebook.workspace(client, access, id, action, {
      write: false,
    });
    if (action === 'IMPORT')
      await this.auth.authorizedTarget(client, access, work.sheet, 'VIEW');
    return work;
  }

  async validate(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    batch: ResultImportBatch,
    source: ResultImportSource,
    bytes: Buffer,
    options: ImportOptions,
    corrections: ImportCorrection[],
  ): Promise<Validation> {
    const parent = await this.assertExportScope(
      client,
      access,
      batch.exportId,
      'IMPORT',
    );
    if (parent.row.reuseUntil <= new Date())
      return invalidValidation('export_expired');
    if (parent.row.mode !== 'EDIT_DRAFT')
      return invalidValidation('readonly_export');
    const parsed = await this.parseSource(source, bytes, parent.maxFileSize);
    if ('status' in parsed) return parsed;
    const manifest = await this.resolveManifest(
      client,
      access,
      parent.row,
      parsed,
    );
    if (!manifest) return invalidValidation('unknown_row');
    if (manifest.request.mode !== 'EDIT_DRAFT')
      return invalidValidation('readonly_export');
    if (manifest.request.format !== source.format)
      return invalidValidation('malformed_csv');

    const current = new Map<string, CurrentImportSheet>();
    const failures = new Map<string, string>();
    const permissionBinding: ImportReviewBinding['fields'] = [];
    for (const sheet of manifest.sheets) {
      const workspace = await this.openSheet(
        client,
        access,
        sheet.id,
        'IMPORT',
      );
      const { context, definition } = workspace;
      const allowed = manifest.fields.filter(
        (field) => workspace.fields.get(field.id)?.readable,
      );
      const definitionMatches =
        workspace.sheet.draftDefinitionVersionId ===
          sheet.definitionVersionId &&
        workspace.sheet.draftDefinition?.contentDigest ===
          sheet.definitionDigest;
      permissionBinding.push({
        sheetId: sheet.id,
        fieldIds: definitionMatches ? allowed.map((field) => field.id) : [],
      });
      if (!definition || !definitionMatches) {
        failures.set(sheet.id, 'schema_stale');
        continue;
      }
      if (allowed.length !== manifest.fields.length)
        throw new NotFoundDomainException();
      if (!access.permissions.has('official_results.entries.manage'))
        throw new NotFoundDomainException();
      await this.auth.authorizedTarget(client, access, workspace.sheet, 'EDIT');
      if (
        !context.settings.importFormats.includes(source.format) ||
        source.sizeBytes > context.settings.importLimits.maxUploadBytes ||
        parsed.records.length > context.settings.importLimits.maxRows
      )
        return invalidValidation('limit_exceeded');
      if (context.period.status !== 'OPEN' && !sheet.correctionUnitId) {
        failures.set(sheet.id, 'target_locked');
        continue;
      }
      current.set(
        sheet.id,
        await this.loadSheet(client, workspace, access, manifest, sheet),
      );
    }
    const report = compareImport({
      parsed,
      manifest,
      current,
      failures,
      options,
      corrections,
    });
    return {
      ...report,
      exportRef: manifest.exportRef,
      permissionBinding,
      status:
        report.summary.blockingIssues || report.summary.findingsTruncated
          ? 'CORRECTIONS_REQUIRED'
          : report.summary.changedCells
            ? 'READY_TO_CONFIRM'
            : 'NO_CHANGES',
    };
  }

  private async parseSource(
    source: ResultImportSource,
    bytes: Buffer,
    maxUploadBytes: number,
  ): Promise<TabularImport | Validation> {
    try {
      const limits = {
        maxUploadBytes,
        maxRows: platformResultLimits.maxRows,
      };
      return source.format === 'XLSX'
        ? await parseResultsXlsx(bytes, limits)
        : parseResultCsv(bytes, limits);
    } catch (error) {
      if (error instanceof ResultImportFileError)
        return invalidValidation(error.issue);
      throw error;
    }
  }

  private async resolveManifest(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    parent: ResultExport,
    parsed: TabularImport,
  ): Promise<ExportManifest | null> {
    const declared = declaredExportRef(parsed);
    if (declared !== null) {
      if (!z.uuid().safeParse(declared).success) return null;
      try {
        return (
          await this.exportService.findEditManifest(
            client,
            access.actor,
            parent.id,
            declared,
          )
        ).manifest;
      } catch (error) {
        if (error instanceof NotFoundDomainException) return null;
        throw error;
      }
    }
    const matching = await client.resultExportFile.findMany({
      where: {
        schoolId: access.actor.schoolId,
        exportId: parent.id,
        deletedAt: null,
        mediaType: { not: 'application/zip' },
      },
      take: 2,
      select: { manifest: true },
    });
    return matching.length === 1
      ? (matching[0].manifest as unknown as ExportManifest)
      : null;
  }

  private async loadSheet(
    client: Prisma.TransactionClient,
    workspace: Workspace,
    access: ResultPermissionCheck,
    manifest: ExportManifest,
    exported: ExportSheetContext,
  ): Promise<CurrentImportSheet> {
    const { definition, context, sheet } = workspace;
    const { actor } = access;
    const manifestForSheet = manifest.rows.filter(
      (row) => row.identity.sheet_ref === sheet.id,
    );
    const originals = new Map(
      manifestForSheet.map((row) => [row.identity.slot_ref, row]),
    );
    const fields = new Map(
      definition!.fields
        .filter((field) => field.kind !== 'CALCULATED')
        .map((field) => [field.id, field]),
    );
    const currentRows = await this.sheets.rows(
      client,
      actor.schoolId,
      sheet.id,
      {
        slots: [...originals.keys()],
        fieldIds: [...fields.keys()],
        take: originals.size,
      },
    );
    const activeWindows =
      context.period.status === 'OPEN'
        ? []
        : await client.resultCorrectionWindow.findMany({
            where: {
              schoolId: actor.schoolId,
              reportingPeriodId: sheet.reportingPeriodId,
              actorId: actor.actorId,
              slotId: { in: [...originals.keys()] },
              revokedAt: null,
              expiresAt: { gt: new Date() },
              releaseUnitId: exported.correctionUnitId!,
            },
            select: { slotId: true },
          });
    const correctionSlots = new Set(
      activeWindows.map((window) => window.slotId),
    );
    if (context.period.status !== 'OPEN' && correctionSlots.size) {
      workspace = await this.gradebook.workspace(
        client,
        access,
        sheet.id,
        'IMPORT',
        {
          write: true,
          slotId: activeWindows[0].slotId,
          releaseUnitId: exported.correctionUnitId!,
        },
      );
    }
    const writable = manifest.fields.every(
      (field) =>
        workspace.fields.get(field.id)?.editable &&
        (!exported.correctionUnitId ||
          field.releaseUnitId === exported.correctionUnitId),
    );
    const instant = currentRosterInstant(
      sheet.rosterAsOf,
      context.period.endsOn,
      context.period.school.schoolProfile?.timezone ?? 'UTC',
    );
    const placements = await this.roster.placements(
      client,
      context.period,
      instant,
      currentRows.map((row) => row.studentId),
    );
    const failures: CurrentImportSheet['failures'] = new Map(
      [...originals.keys()].map((id) => [id, 'roster_changed']),
    );
    const rows: CurrentImportSheet['rows'] = new Map();
    for (const record of currentRows) {
      const prior = originals.get(record.id)!;
      const active = placements.get(record.studentId) ?? [];
      const match = record.historicalPlacement
        ? active.length <= 1 && workspace.mayEditHistorical
        : active.length === 1 &&
          active[0].id === record.enrollmentId &&
          active[0].classroomId === sheet.classroomId;
      if (
        !match ||
        record.rosterState !== 'ELIGIBLE' ||
        record.groupExempt ||
        record.placementRevision !== prior.placementRevision ||
        record.enrollmentId !== prior.identity.enrollment_ref
      )
        continue;
      if (
        !writable ||
        (context.period.status !== 'OPEN' && !correctionSlots.has(record.id))
      ) {
        failures.set(record.id, 'target_locked');
        continue;
      }
      failures.delete(record.id);
      rows.set(
        record.id,
        new Map(
          record.cells.map((cell) => [
            cell.fieldId,
            {
              value: printableDraftValue(
                fields.get(cell.fieldId)!,
                storedCellValue(cell),
              ),
              version: cell.version,
            },
          ]),
        ),
      );
    }
    const newlyEligibleCount = await client.resultSlot.count({
      where: {
        schoolId: actor.schoolId,
        sheetId: sheet.id,
        rosterState: 'ELIGIBLE',
        groupExempt: false,
        createdAt: { gt: new Date(manifest.exportedAt) },
        id: { notIn: [...originals.keys()] },
      },
    });
    return {
      binding: {
        sheetId: sheet.id,
        classroomId: sheet.classroomId,
        groupId: sheet.groupId,
        reportingPeriodId: sheet.reportingPeriodId,
        draftDefinitionVersionId: exported.definitionVersionId,
        sheetRevision: sheet.sheetRevision,
        rosterRevision: sheet.rosterGeneration,
        policyRevision: context.policyRevision,
        snapshotDataGeneration: sheet.dataGeneration,
        correctionUnitId: exported.correctionUnitId,
        slots: [],
      },
      definition: definition!,
      rows,
      maxChanges:
        context.settings.importLimits.maxChangedCellsPerAtomicSheetUnit,
      failures,
      newlyEligibleCount,
    };
  }
}

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { OfficialResultsError } from '../domain/official-results.error';
import { currentRosterInstant } from '../domain/reporting-dates';
import { resultContentDigest } from '../domain/result-content-digest';
import { releaseSnapshot } from '../domain/result-release.contract';
import { resultFieldAccess } from '../domain/result-field-access';
import { storedResultDefinition } from '../domain/sheet-definition-seed';
import { storedCellValue } from '../domain/result-value';
import type {
  ExportIdentity,
  ExportRequest,
  ExportRow,
  ExportSheetPlan,
} from '../domain/result-export.contract';
import {
  ResultAuthorizationRepository,
  type ResultPermissionCheck,
} from '../infrastructure/repositories/result-authorization.repository';
import { ResultGradebookRepository } from '../infrastructure/repositories/result-gradebook.repository';
import { ResultRosterRepository } from '../infrastructure/repositories/result-roster.repository';
import { ResultTemplateScopeRepository } from '../infrastructure/repositories/result-template-scope.repository';
import {
  presentGradebookRow,
  presentResultSheet,
  printableDraftValue,
} from './result-gradebook.presenter';
import { ResultGradebookService } from './result-gradebook.service';

type Workspace = Awaited<ReturnType<ResultGradebookService['workspace']>>;
type LocatedRow = {
  id: string;
  student: { studentId: string; displayName: string };
  enrollmentId: string;
  academicContext: ReturnType<typeof presentResultSheet>['academicContext'];
  group: ReturnType<typeof presentResultSheet>['group'];
};

function identity(row: LocatedRow, sheetId: string): ExportIdentity {
  const {
    school,
    academicYear,
    reportingPeriod,
    term,
    stage,
    grade,
    section,
    classroom,
  } = row.academicContext;
  return {
    sheet_ref: sheetId,
    slot_ref: row.id,
    enrollment_ref: row.enrollmentId,
    student_code: row.student.studentId
      .replaceAll('-', '')
      .slice(0, 12)
      .toUpperCase(),
    student_name_ar: row.student.displayName,
    school: school.name.ar,
    academic_year: academicYear.name.ar,
    reporting_period: reportingPeriod.name.ar,
    term: term?.name.ar ?? 'YEAR_PERIOD',
    stage: stage.name.ar,
    grade: grade.name.ar,
    section: section.name.ar,
    classroom: classroom.name.ar,
    group: row.group.label.ar,
  };
}

function distinct<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}

export function exportSummary(plans: ExportSheetPlan[]) {
  const sheets = new Map<
    string,
    {
      sheetId: string;
      classroomId: string;
      groupId: string;
      classroomLabel: string;
      groupLabel: string;
      fields: {
        fieldId: string;
        code: string;
        label: { ar: string; en: string };
        optionCodes?: string[];
      }[];
      definitionVersionIds: string[];
      rows: number;
      sheetRevision: number;
      dataGeneration: number;
      rosterGeneration: number;
      policyRevision: number;
    }
  >();
  for (const plan of plans) {
    const context = plan.context;
    const fields = plan.fields.map((field) => ({
      fieldId: field.id,
      code: field.code,
      label: field.label,
      ...(field.options
        ? {
            optionCodes: field.options
              .filter((option) => option.active)
              .map((option) => option.code),
          }
        : {}),
    }));
    const previous = sheets.get(context.id);
    if (previous) {
      previous.definitionVersionIds = distinct(
        previous.definitionVersionIds.concat(context.definitionVersionId),
      );
      previous.rows += plan.rows.length;
      previous.fields = [
        ...new Map(
          previous.fields.concat(fields).map((field) => [field.fieldId, field]),
        ).values(),
      ];
    } else {
      sheets.set(context.id, {
        sheetId: context.id,
        classroomId: context.classroomId,
        groupId: context.groupId,
        classroomLabel: plan.classroomLabel,
        groupLabel: plan.groupLabel,
        fields,
        definitionVersionIds: [context.definitionVersionId],
        rows: plan.rows.length,
        sheetRevision: context.sheetRevision,
        dataGeneration: context.dataGeneration,
        rosterGeneration: context.rosterGeneration,
        policyRevision: context.policyRevision,
      });
    }
  }
  return {
    sheets: [...sheets.values()],
    sheetCount: sheets.size,
    rowCount: plans.reduce((count, plan) => count + plan.rows.length, 0),
  };
}

@Injectable()
export class ResultExportPlanService {
  constructor(
    private readonly auth: ResultAuthorizationRepository,
    private readonly scopes: ResultTemplateScopeRepository,
    private readonly sheets: ResultGradebookRepository,
    private readonly roster: ResultRosterRepository,
    private readonly gradebook: ResultGradebookService,
  ) {}

  async plan(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    request: ExportRequest,
  ) {
    this.auth.requirePermission(access, 'official_results.exports.create');
    this.auth.requirePermission(access, 'official_results.sheets.view');
    const { schoolId } = access.actor;
    const draft = request.mode === 'EDIT_DRAFT';
    if (draft) {
      this.auth.requirePermission(access, 'official_results.entries.manage');
      this.auth.requirePermission(access, 'official_results.imports.manage');
    }
    if (request.format !== 'CSV')
      throw new OfficialResultsError('export.format_disabled');
    const targets = await this.scopes.targets(
      client,
      schoolId,
      request.reportingPeriodId,
      request.academicScope,
      request.groupIds,
    );
    const allowed = new Set(
      targets.map((target) => target.academic.CLASSROOM + ':' + target.groupId),
    );
    const selected = await client.resultSheet.findMany({
      where: {
        schoolId,
        reportingPeriodId: request.reportingPeriodId,
        groupId: { in: request.groupIds },
        classroomId: {
          in: distinct(targets.map((target) => target.academic.CLASSROOM)),
        },
        ...(request.selectedSlotIds
          ? { slots: { some: { id: { in: request.selectedSlotIds } } } }
          : {}),
      },
      orderBy: { id: 'asc' },
      select: { id: true, classroomId: true, groupId: true },
    });
    const explicit =
      request.academicScope.level === 'CLASSROOM' ||
      Boolean(request.selectedSlotIds);
    const school = await client.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { slug: true },
    });
    const plans: ExportSheetPlan[] = [];
    let retentionDays = 30;
    let cells = 0;
    for (const sheet of selected) {
      if (!allowed.has(sheet.classroomId + ':' + sheet.groupId)) {
        if (explicit) throw new NotFoundDomainException();
        continue;
      }
      let workspace: Workspace;
      try {
        workspace = await this.gradebook.workspace(
          client,
          access,
          sheet.id,
          'EXPORT',
          { write: false },
        );
        await this.auth.authorizedTarget(
          client,
          access,
          workspace.sheet,
          'VIEW',
        );
        if (draft) {
          await this.auth.authorizedTarget(
            client,
            access,
            workspace.sheet,
            'EDIT',
          );
          await this.auth.authorizedTarget(
            client,
            access,
            workspace.sheet,
            'IMPORT',
          );
        }
      } catch (error) {
        if (!explicit && error instanceof NotFoundDomainException) continue;
        throw error;
      }
      const settings = workspace.context.settings;
      if (!settings.importFormats.includes(request.format))
        throw new OfficialResultsError('export.format_disabled');
      retentionDays = Math.min(
        retentionDays,
        settings.temporaryFileRetentionDays,
      );
      const parts = draft
        ? [await this.draft(client, access, workspace, request, school.slug)]
        : await this.published(client, access, workspace, request, school.slug);
      for (const part of parts) {
        cells += part.rows.length * (18 + part.fields.length * 2);
        if (cells > 2_000_000)
          throw new OfficialResultsError('scope.limit_exceeded');
        if (part.rows.length && part.fields.length) plans.push(part);
      }
    }
    const actualSlots = new Set(
      plans.flatMap((plan) => plan.rows.map((row) => row.identity.slot_ref)),
    );
    const actualFields = new Set(
      plans.flatMap((plan) => plan.fields.map((field) => field.id)),
    );
    if (
      request.selectedSlotIds?.some((id) => !actualSlots.has(id)) ||
      request.selectedFieldIds?.some((id) => !actualFields.has(id))
    )
      throw new NotFoundDomainException();
    const summary = exportSummary(plans);
    if (!plans.length && explicit) throw new NotFoundDomainException();
    if (
      explicit &&
      !request.selectedSlotIds &&
      request.academicScope.level === 'CLASSROOM' &&
      request.academicScope.ids.some(
        (id) => !summary.sheets.some((sheet) => sheet.classroomId === id),
      )
    )
      throw new NotFoundDomainException();
    const fingerprint = resultContentDigest({ request, plans, retentionDays });
    return { plans, summary, fingerprint, retentionDays };
  }

  async authorizeRecordedPlan(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    summary: ReturnType<typeof exportSummary>,
  ) {
    this.auth.requirePermission(access, 'official_results.exports.create');
    this.auth.requirePermission(access, 'official_results.sheets.view');
    for (const entry of summary.sheets) {
      const current = await this.gradebook.workspace(
        client,
        access,
        entry.sheetId,
        'EXPORT',
        { write: false },
      );
      await this.auth.authorizedTarget(client, access, current.sheet, 'VIEW');
      if (
        entry.fields.some(
          (field) => !current.fields.get(field.fieldId)?.readable,
        )
      )
        throw new NotFoundDomainException();
    }
  }

  private async draft(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    initial: Workspace,
    request: ExportRequest,
    schoolCode: string,
  ): Promise<ExportSheetPlan> {
    const { actor } = access;
    const initialSheet = initial.sheet;
    const candidates = await this.sheets.rows(
      client,
      actor.schoolId,
      initialSheet.id,
      {
        fieldIds: initial.loadFields,
        slots: request.selectedSlotIds,
        take: 25001,
      },
    );
    if (candidates.length > 25000)
      throw new OfficialResultsError('roster.limit_exceeded');
    let workspace = initial;
    let correctionUnitId: string | null = null;
    if (initial.context.period.status !== 'OPEN') {
      if (!request.selectedSlotIds || !candidates.length)
        throw new OfficialResultsError('period.closed');
      const windows = await client.resultCorrectionWindow.findMany({
        where: {
          schoolId: actor.schoolId,
          actorId: actor.actorId,
          reportingPeriodId: initialSheet.reportingPeriodId,
          slotId: { in: candidates.map((row) => row.id) },
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { releaseUnitId: 'asc' },
        select: { slotId: true, releaseUnitId: true },
      });
      const named =
        initial.definition?.fields.filter((field) =>
          request.selectedFieldIds?.includes(field.id),
        ) ?? [];
      const unit = distinct(windows.map((window) => window.releaseUnitId)).find(
        (id) =>
          named.every((field) => field.releaseUnitId === id) &&
          candidates.every((row) =>
            windows.some(
              (window) =>
                window.releaseUnitId === id && window.slotId === row.id,
            ),
          ),
      );
      if (!unit) throw new OfficialResultsError('period.closed');
      correctionUnitId = unit;
      workspace = await this.gradebook.workspace(
        client,
        access,
        initialSheet.id,
        'EXPORT',
        {
          write: true,
          slotId: candidates[0].id,
          releaseUnitId: unit,
        },
      );
    }
    const { definition, sheet, context } = workspace;
    if (
      !definition ||
      !sheet.draftDefinitionVersionId ||
      !sheet.draftDefinition
    )
      throw new OfficialResultsError('schema.stale');
    const fields = definition.fields.filter(
      (field) =>
        field.kind !== 'CALCULATED' &&
        workspace.fields.get(field.id)?.editable &&
        (!correctionUnitId || field.releaseUnitId === correctionUnitId) &&
        (!request.selectedFieldIds ||
          request.selectedFieldIds.includes(field.id)),
    );
    const asOf = currentRosterInstant(
      sheet.rosterAsOf,
      context.period.endsOn,
      context.period.school.schoolProfile?.timezone ?? 'UTC',
    );
    const placements = await this.roster.placements(
      client,
      context.period,
      asOf,
      candidates.map((row) => row.studentId),
    );
    const selected = new Set(fields.map((field) => field.id));
    const metadata = presentResultSheet(sheet);
    const rows: ExportRow[] = [];
    for (const row of candidates) {
      if (row.rosterState !== 'ELIGIBLE' || row.groupExempt) {
        if (row.rosterState === 'RECONCILIATION_REQUIRED')
          throw new OfficialResultsError('roster.changed', { slotId: row.id });
        continue;
      }
      const active = placements.get(row.studentId) ?? [];
      const applicable = row.historicalPlacement
        ? active.length <= 1 && workspace.mayEditHistorical
        : active.length === 1 &&
          active[0].id === row.enrollmentId &&
          active[0].classroomId === sheet.classroomId;
      if (!applicable)
        throw new OfficialResultsError('roster.changed', { slotId: row.id });
      const { student } = presentGradebookRow(
        row,
        null,
        new Map(),
        selected,
        false,
      );
      const stored = new Map(row.cells.map((cell) => [cell.fieldId, cell]));
      rows.push({
        identity: identity(
          { id: row.id, student, enrollmentId: row.enrollmentId, ...metadata },
          sheet.id,
        ),
        studentId: row.studentId,
        placementRevision: row.placementRevision,
        slotRevision: row.revision,
        publicationIds: [],
        base: fields.map((field) => {
          const cell = stored.get(field.id);
          return {
            fieldId: field.id,
            version: cell?.version ?? 0,
            value: cell
              ? printableDraftValue(field, storedCellValue(cell))
              : { status: 'MISSING' },
          };
        }),
      });
    }
    return this.sheetPlan(
      workspace,
      schoolCode,
      sheet.draftDefinitionVersionId,
      sheet.draftDefinition.contentDigest,
      {
        definition,
        fields,
        rows,
        correctionUnitId,
      },
    );
  }

  private async published(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    workspace: Workspace,
    request: ExportRequest,
    schoolCode: string,
  ) {
    const { actor } = access;
    const { sheet } = workspace;
    const active = await client.resultPublication.findMany({
      where: {
        schoolId: actor.schoolId,
        activePointer: { isNot: null },
        candidate: { sheetId: sheet.id },
        slot: { sheetId: sheet.id },
        ...(request.selectedSlotIds
          ? { slotId: { in: request.selectedSlotIds } }
          : {}),
      },
      orderBy: [{ slotId: 'asc' }, { id: 'asc' }],
      take: 50001,
      select: {
        id: true,
        slotId: true,
        definitionVersionId: true,
        slot: {
          select: {
            placementRevision: true,
            revision: true,
            enrollmentId: true,
          },
        },
        candidate: {
          select: {
            snapshot: true,
            definition: {
              select: { configuration: true, contentDigest: true },
            },
          },
        },
      },
    });
    if (active.length > 50000)
      throw new OfficialResultsError('scope.limit_exceeded');
    const grants = await this.auth.fieldGrants(client, actor, sheet, false);
    const plans = new Map<string, ExportSheetPlan>();
    for (const release of active) {
      const snapshot = releaseSnapshot.parse(release.candidate.snapshot);
      if (
        snapshot.academicContext.classroom.id !== sheet.classroomId ||
        release.slot.placementRevision !== snapshot.placementRevision ||
        release.slot.enrollmentId !== snapshot.enrollmentId
      )
        continue;
      const source = release.candidate.definition;
      const definition = storedResultDefinition(source.configuration)!;
      const historical = resultFieldAccess({
        definition,
        accepted: definition,
        teacher: actor.userType === 'TEACHER',
        grants,
        canEdit: false,
      });
      const outputIds = new Set(snapshot.unit.outputFieldIds);
      const fields = snapshot.fields
        .map(({ definition: field }) => field)
        .filter(
          (field) =>
            outputIds.has(field.id) &&
            historical.get(field.id)?.readable &&
            workspace.fields.get(field.id)?.readable &&
            (!request.selectedFieldIds ||
              request.selectedFieldIds.includes(field.id)),
        );
      if (!fields.length) continue;
      const key =
        release.definitionVersionId +
        ':' +
        fields.map((field) => field.id).join(':');
      const part =
        plans.get(key) ??
        this.sheetPlan(
          workspace,
          schoolCode,
          release.definitionVersionId,
          source.contentDigest,
          {
            definition,
            fields,
            rows: [],
            correctionUnitId: null,
          },
        );
      const values = new Map(
        snapshot.fields.map((item) => [item.definition.id, item]),
      );
      part.rows.push({
        identity: identity({ id: release.slotId, ...snapshot }, sheet.id),
        studentId: snapshot.student.studentId,
        placementRevision: snapshot.placementRevision,
        slotRevision: release.slot.revision,
        publicationIds: [release.id],
        base: fields.map((field) => ({
          fieldId: field.id,
          value: values.get(field.id)!.value,
          version: values.get(field.id)!.cellVersion ?? 0,
        })),
      });
      plans.set(key, part);
    }
    return [...plans.values()];
  }

  private sheetPlan(
    workspace: Workspace,
    schoolCode: string,
    definitionVersionId: string,
    definitionDigest: string,
    contents: Pick<ExportSheetPlan, 'definition' | 'fields' | 'rows'> & {
      correctionUnitId: string | null;
    },
  ): ExportSheetPlan {
    const { sheet, context } = workspace;
    const { correctionUnitId, definition, fields, rows } = contents;
    return {
      context: {
        id: sheet.id,
        definitionVersionId,
        definitionDigest,
        sheetRevision: sheet.sheetRevision,
        dataGeneration: sheet.dataGeneration,
        rosterGeneration: sheet.rosterGeneration,
        policyRevision: context.policyRevision,
        correctionUnitId,
        classroomId: sheet.classroomId,
        groupId: sheet.groupId,
      },
      definition,
      fields,
      rows,
      groupLabel: sheet.group.labelAr,
      classroomLabel: sheet.classroom.nameAr,
      filenameCodes: [
        'SCH-' + schoolCode,
        sheet.reportingPeriod.academicYear.nameEn ||
          sheet.reportingPeriod.academicYear.id.slice(0, 8),
        sheet.reportingPeriod.code,
        sheet.classroom.section.grade.nameEn ||
          sheet.classroom.section.grade.id.slice(0, 8),
        sheet.classroom.section.nameEn ||
          sheet.classroom.section.id.slice(0, 8),
        sheet.classroom.nameEn || sheet.classroomId.slice(0, 8),
        sheet.group.labelEn || sheet.groupId.slice(0, 8),
        'V-' + definitionVersionId.slice(0, 8),
      ],
      uploadBytes: context.settings.importLimits.maxUploadBytes,
      maxRows: context.settings.importLimits.maxRows,
    };
  }
}

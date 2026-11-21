import { Injectable } from '@nestjs/common';
import type { Prisma, ResultGrantAction } from '@prisma/client';
import { OfficialResultsError } from '../domain/official-results.error';
import { evaluateResultFields } from '../domain/result-calculation';
import { resultContentDigest } from '../domain/result-content-digest';
import { currentRosterInstant } from '../domain/reporting-dates';
import type { ReleaseSnapshot } from '../domain/result-release.contract';
import { storedResultDefinition } from '../domain/sheet-definition-seed';
import { storedCellValue, type ResultValue } from '../domain/result-value';
import {
  ResultAuthorizationRepository,
  type ResultPermissionCheck,
} from '../infrastructure/repositories/result-authorization.repository';
import { ResultGradebookRepository } from '../infrastructure/repositories/result-gradebook.repository';
import {
  ResultReleaseRepository,
  type ReleaseCandidate,
} from '../infrastructure/repositories/result-release.repository';
import { ResultRosterRepository } from '../infrastructure/repositories/result-roster.repository';
import {
  presentGradebookRow,
  presentResultSheet,
  printableDraftValue,
} from './result-gradebook.presenter';

type Context = Awaited<
  ReturnType<ResultAuthorizationRepository['authorizedTarget']>
>;

@Injectable()
export class ResultReleaseSnapshotService {
  constructor(
    private readonly auth: ResultAuthorizationRepository,
    private readonly sheets: ResultGradebookRepository,
    private readonly roster: ResultRosterRepository,
    private readonly release: ResultReleaseRepository,
  ) {}

  async authorizeSlot(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    slotId: string,
    releaseUnitId: string,
    action: ResultGrantAction,
    review = false,
    allowHistorical = false,
  ) {
    const initial = await this.release.slot(
      client,
      access.actor.schoolId,
      slotId,
    );
    const context = await this.auth.authorizedTarget(
      client,
      access,
      initial.sheet,
      action,
      {
        write: true,
        review,
        slotId,
        releaseUnitId,
      },
    );
    const sheet = await this.sheets.sheet(
      client,
      access.actor.schoolId,
      initial.sheetId,
      true,
    );
    if (!allowHistorical) {
      const asOf = currentRosterInstant(
        sheet.rosterAsOf,
        context.period.endsOn,
        context.period.school.schoolProfile?.timezone ?? 'UTC',
      );
      const placements =
        (
          await this.roster.placements(
            client,
            context.period,
            asOf,
            [initial.studentId],
            true,
          )
        ).get(initial.studentId) ?? [];
      if (
        initial.rosterState !== 'ELIGIBLE' ||
        initial.groupExempt ||
        (initial.historicalPlacement
          ? placements.length > 1 ||
            (access.actor.userType === 'TEACHER' &&
              !(await this.auth.hasHistoricalEditGrant(
                client,
                access.actor,
                sheet,
                true,
              )))
          : placements.length !== 1 ||
            placements[0].id !== initial.enrollmentId ||
            placements[0].classroomId !== sheet.classroomId)
      ) {
        throw new OfficialResultsError('roster.changed');
      }
    }
    const slot = await this.release.slot(
      client,
      access.actor.schoolId,
      slotId,
      true,
    );
    if (
      initial.sheetId !== slot.sheetId ||
      initial.placementRevision !== slot.placementRevision
    ) {
      throw new OfficialResultsError('roster.changed');
    }
    return { sheet, context, slot };
  }

  async snapshot(
    client: Prisma.TransactionClient,
    state: Awaited<ReturnType<ResultReleaseSnapshotService['authorizeSlot']>>,
    releaseUnitId: string,
    correction: ReleaseSnapshot['correction'],
  ) {
    const { sheet, context, slot } = state;
    const definition = storedResultDefinition(
      sheet.draftDefinition?.configuration,
    );
    const unit = definition?.releaseUnits.find(
      (item) => item.id === releaseUnitId,
    );
    if (!definition || !unit) throw new OfficialResultsError('schema.stale');
    const byId = new Map(definition.fields.map((field) => [field.id, field]));
    const required = new Set(unit.outputFieldIds);
    const includeOperands = (fieldId: string) => {
      for (const source of byId.get(fieldId)?.formula?.operands ?? []) {
        if (!required.has(source.fieldId)) {
          required.add(source.fieldId);
          includeOperands(source.fieldId);
        }
      }
    };
    unit.outputFieldIds.forEach(includeOperands);
    const manual = definition.fields.filter(
      (field) => required.has(field.id) && !field.formula,
    );
    const [row] = await this.sheets.rows(client, sheet.schoolId, sheet.id, {
      slots: [slot.id],
      fieldIds: manual.map((field) => field.id),
      take: 1,
    });
    if (!row) throw new OfficialResultsError('roster.changed');
    const entries = new Map(row.cells.map((cell) => [cell.fieldId, cell]));
    const values = new Map(
      manual.map((field) => {
        const cell = entries.get(field.id);
        const value: ResultValue = cell
          ? printableDraftValue(field, storedCellValue(cell))
          : { status: 'MISSING' };
        return [field.id, value];
      }),
    );
    const computed = evaluateResultFields(definition, values, required);
    const validationIssues: ReleaseSnapshot['validationIssues'] = [];
    const fields = definition.fields
      .filter((field) => required.has(field.id))
      .map((field) => {
        const output = computed.get(field.id);
        const value = output?.value ?? values.get(field.id)!;
        const usable =
          value.status === 'RECORDED' ||
          value.status === 'NOT_APPLICABLE' ||
          (value.status === 'ABSENT' &&
            definition.calculationPolicy.absent === 'ZERO') ||
          (value.status === 'EXCUSED' &&
            definition.calculationPolicy.excused === 'EXCLUDE');
        if (field.requiredForFinal && !usable)
          validationIssues.push({
            fieldId: field.id,
            code: 'REQUIRED_VALUE_UNRESOLVED',
          });
        if (
          field.stateReasonRequired.includes(value.status) &&
          !entries.get(field.id)?.stateReason
        ) {
          validationIssues.push({
            fieldId: field.id,
            code: 'STATE_REASON_REQUIRED',
          });
        }
        if (output) {
          const { calculationStatus, evaluation, reason, effectiveWeight } =
            output;
          const calculation = {
            calculationStatus,
            evaluation,
            reason,
            effectiveWeight,
          };
          return { definition: field, value, calculation };
        }
        return {
          definition: field,
          value,
          cellVersion: entries.get(field.id)?.version ?? 0,
        };
      });
    const mandatoryManual = fields.filter(
      (field) => field.definition.requiredForFinal && !field.definition.formula,
    );
    if (
      mandatoryManual.length &&
      mandatoryManual.every(
        (field) => field.value.status === 'NOT_APPLICABLE',
      ) &&
      !slot.groupExempt
    ) {
      validationIssues.push({
        fieldId: unit.outputFieldIds[0],
        code: 'GROUP_APPLICABILITY_REQUIRED',
      });
    }
    const present = presentResultSheet(sheet);
    const student = presentGradebookRow(
      row,
      null,
      new Map(),
      new Set(),
      false,
    ).student;
    const snapshot: ReleaseSnapshot = {
      schemaVersion: '1.0',
      calculatorVersion: 1,
      student,
      academicContext: present.academicContext,
      enrollmentId: slot.enrollmentId,
      placementRevision: slot.placementRevision,
      group: present.group,
      unit,
      calculationPolicy: definition.calculationPolicy,
      definitionDigest: sheet.draftDefinition!.contentDigest,
      policyVersionId: context.policyVersionId,
      correction,
      fields,
      completeness: validationIssues.length ? 'PARTIAL' : 'COMPLETE',
      validationIssues,
    };
    const sourceFingerprint = resultContentDigest({
      slotId: slot.id,
      sheetId: sheet.id,
      placementRevision: slot.placementRevision,
      enrollmentId: slot.enrollmentId,
      definitionVersionId: sheet.draftDefinitionVersionId,
      releaseUnitId,
      manual: fields
        .filter((field) => field.cellVersion !== undefined)
        .map(({ definition, cellVersion, value }) => ({
          fieldId: definition.id,
          cellVersion,
          value,
        })),
    });
    return { snapshot, sourceFingerprint };
  }

  ensureReleasable(snapshot: ReleaseSnapshot, context: Context) {
    if (context.settings.publicationSuspended)
      throw new OfficialResultsError('publication.forbidden');
    if (
      snapshot.completeness === 'PARTIAL' &&
      (snapshot.unit.classification === 'FINAL' ||
        !context.settings.allowPartialProgressPublication ||
        snapshot.validationIssues.some(
          (issue) => issue.code !== 'REQUIRED_VALUE_UNRESOLVED',
        ))
    ) {
      throw new OfficialResultsError('publication.incomplete');
    }
  }

  async current(
    client: Prisma.TransactionClient,
    candidate: ReleaseCandidate,
    state: Awaited<ReturnType<ResultReleaseSnapshotService['authorizeSlot']>>,
  ) {
    if (
      candidate.sheetId !== state.sheet.id ||
      candidate.definitionVersionId !== state.sheet.draftDefinitionVersionId ||
      candidate.policyVersionId !== state.context.policyVersionId
    )
      throw new OfficialResultsError('candidate.stale');
    const correction = candidate.correction
      ? {
          previousPublicationId: candidate.correction.previousPublicationId,
          reason: candidate.correction.reason,
        }
      : null;
    const observed = await this.snapshot(
      client,
      state,
      candidate.releaseUnitId,
      correction,
    );
    if (observed.sourceFingerprint !== candidate.sourceFingerprint)
      throw new OfficialResultsError('candidate.stale');
    return observed.snapshot;
  }
}

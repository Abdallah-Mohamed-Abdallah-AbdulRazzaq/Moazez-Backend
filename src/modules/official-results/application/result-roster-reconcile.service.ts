import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { OfficialResultsError } from '../domain/official-results.error';
import { assertRosterDate } from '../domain/reporting-dates';
import { resultContentDigest } from '../domain/result-content-digest';
import { resultFieldAccess } from '../domain/result-field-access';
import {
  rosterPreviewInput,
  type RosterPreviewInput,
  type RosterReconcileInput,
} from '../domain/result-roster-contract';
import { storedResultDefinition } from '../domain/sheet-definition-seed';
import {
  ResultAuthorizationRepository,
  type ResultPermissionCheck,
} from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import {
  ResultGradebookRepository,
  type GradebookSheet,
} from '../infrastructure/repositories/result-gradebook.repository';
import { ResultPreviewRepository } from '../infrastructure/repositories/result-preview.repository';
import { ResultRosterReconcileRepository } from '../infrastructure/repositories/result-roster-reconcile.repository';
import { ResultRosterRepository } from '../infrastructure/repositories/result-roster.repository';
import { requireResultActor } from './result-actor';
import { presentResultSheet } from './result-gradebook.presenter';

type Context = Awaited<
  ReturnType<ResultAuthorizationRepository['authorizedTarget']>
>;

type RosterChange = {
  kind:
    | 'ADDED'
    | 'MOVED'
    | 'WITHDRAWN'
    | 'AMBIGUOUS'
    | 'MOVED_IN'
    | 'APPLICABILITY';
  studentId: string;
  slotId: string | null;
  placementRevision: number | null;
  enrollmentId: string | null;
  destinationEnrollmentId: string | null;
  destinationSheetId: string | null;
  classroomId: string | null;
  groupExempt: boolean;
};

@Injectable()
export class ResultRosterReconcileService {
  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly auth: ResultAuthorizationRepository,
    private readonly sheets: ResultGradebookRepository,
    private readonly roster: ResultRosterRepository,
    private readonly edits: ResultRosterReconcileRepository,
    private readonly previews: ResultPreviewRepository,
  ) {}

  preview(sheetId: string, input: RosterPreviewInput) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor, {
        write: true,
      });
      this.auth.requirePermission(access, 'official_results.rosters.manage');
      const sheet = await this.sheets.sheet(client, actor.schoolId, sheetId);
      const context = await this.auth.authorizedTarget(
        client,
        access,
        sheet,
        'VIEW',
      );
      const plan = await this.plan(client, sheet, context, input, false);
      const preview = await this.previews.create(
        client,
        actor,
        'ROSTER_RECONCILIATION',
        sheetId,
        {
          input,
          fingerprint: plan.fingerprint,
        },
      );
      return {
        ...preview,
        changes: plan.changes,
        blockers: plan.blockers,
        impacts: [
          {
            kind: 'ROSTER_RECONCILIATION',
            resourceId: sheetId,
            before: {
              rosterGeneration: sheet.rosterGeneration,
              rosterAsOf: sheet.rosterAsOf.toISOString(),
            },
            after: {
              rosterAsOf: input.rosterAsOf,
              eligibleAdditions: plan.changes.filter(
                (change) => change.kind === 'ADDED',
              ).length,
            },
          },
        ],
      };
    });
  }

  reconcile(sheetId: string, input: RosterReconcileInput, key?: string) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor, {
        write: true,
      });
      this.auth.requirePermission(access, 'official_results.rosters.manage');
      const current = await this.sheets.sheet(client, actor.schoolId, sheetId);
      const context = await this.auth.authorizedTarget(
        client,
        access,
        current,
        'EDIT',
        { write: true },
      );
      return this.commands.idempotent(
        client,
        actor,
        'rosters.reconcile',
        key,
        { sheetId, ...input },
        async () => {
          const saved = await this.previews.load(
            client,
            actor,
            'ROSTER_RECONCILIATION',
            sheetId,
            input.previewId,
            input.previewDigest,
          );
          const binding = saved as unknown as {
            input: unknown;
            fingerprint: string;
          };
          const previewed = rosterPreviewInput.parse(binding.input);
          if (
            input.expectedRosterGeneration !==
            previewed.expectedRosterGeneration
          )
            throw new OfficialResultsError('preview.stale');
          const destinations = input.decisions.flatMap((decision) =>
            decision.action === 'MOVE_DRAFT'
              ? [decision.destinationSheetId]
              : [],
          );
          const sheets = [...new Set([sheetId, ...destinations])].sort();
          await this.edits.lockSheets(client, actor.schoolId, sheets);
          const source = await this.sheets.sheet(
            client,
            actor.schoolId,
            sheetId,
          );
          const plan = await this.plan(
            client,
            source,
            context,
            previewed,
            true,
          );
          if (plan.fingerprint !== binding.fingerprint)
            throw new OfficialResultsError('preview.stale');
          if (plan.blockers.length)
            throw new OfficialResultsError('roster.changed', {
              blockers: plan.blockers,
            });

          const decisions = new Map(
            input.decisions.map((decision) => [decision.slotId, decision]),
          );
          if (decisions.size !== input.decisions.length)
            throw new ValidationDomainException(
              'Duplicate roster reconciliation decision',
            );
          const slots = new Map(plan.slots.map((slot) => [slot.id, slot]));
          const planned = new Map(
            plan.changes
              .filter((change) => change.slotId !== null)
              .map((change) => [change.slotId!, change]),
          );
          if (
            plan.changes.some(
              (change) =>
                (change.kind === 'MOVED' || change.kind === 'WITHDRAWN') &&
                !decisions.has(change.slotId!),
            )
          ) {
            throw new OfficialResultsError('roster.changed', {
              reasonCode: 'DECISION_REQUIRED',
            });
          }

          const asOf = new Date(previewed.rosterAsOf);
          for (const decision of input.decisions) {
            const slot = slots.get(decision.slotId);
            const change = planned.get(decision.slotId);
            if (
              !slot ||
              !change ||
              slot.sheetId !== sheetId ||
              slot.placementRevision !== decision.expectedPlacementRevision
            )
              throw new OfficialResultsError('preview.stale');
            const movedOrWithdrawn =
              change.kind === 'MOVED' || change.kind === 'WITHDRAWN';
            if (decision.action === 'MOVE_DRAFT') {
              if (
                change.kind !== 'MOVED' ||
                decision.destinationSheetId !== change.destinationSheetId ||
                decision.destinationEnrollmentId !==
                  change.destinationEnrollmentId
              ) {
                throw new OfficialResultsError('roster.changed');
              }
              const destination = await this.sheets.sheet(
                client,
                actor.schoolId,
                decision.destinationSheetId,
              );
              await this.auth.authorizedTarget(
                client,
                access,
                destination,
                'EDIT',
                { write: true },
              );
              const sourceAccess = await this.mappingAccess(
                client,
                access,
                source,
                false,
              );
              const targetAccess = await this.mappingAccess(
                client,
                access,
                destination,
                true,
              );
              await this.edits.moveValues(
                client,
                actor,
                slot,
                source,
                destination,
                decision.fieldMapping,
                sourceAccess,
                targetAccess,
                decision.reason,
              );
            } else if (
              (decision.action === 'KEEP_HISTORICAL' && !movedOrWithdrawn) ||
              (decision.action === 'CLOSE_DRAFT' &&
                slot.rosterState === 'CLOSED') ||
              (decision.action === 'EXEMPT_GROUP' &&
                (change.kind !== 'APPLICABILITY' || slot.groupExempt)) ||
              (decision.action === 'REINSTATE_GROUP' &&
                (change.kind !== 'APPLICABILITY' || !slot.groupExempt))
            ) {
              throw new OfficialResultsError('roster.changed');
            }
            await this.edits.update(client, actor, slot, decision, asOf);
          }
          const additions = plan.changes.filter(
            (change) => change.kind === 'ADDED',
          );
          for (const change of additions) {
            await this.edits.add(
              client,
              actor,
              source,
              change.studentId,
              change.destinationEnrollmentId!,
              asOf,
            );
          }
          if (decisions.size || additions.length) {
            await this.edits.bump(client, actor.schoolId, sheets, asOf);
            await this.commands.audit(
              client,
              actor,
              'rosters.reconcile',
              'result_sheet',
              sheetId,
              {
                previewId: input.previewId,
                rosterAsOf: previewed.rosterAsOf,
                added: additions.length,
                decisions: decisions.size,
              },
            );
          }
          return {
            ...presentResultSheet(
              await this.sheets.sheet(client, actor.schoolId, sheetId),
            ),
            addedCount: additions.length,
            decisionsApplied: decisions.size,
          };
        },
      );
    });
  }

  private async mappingAccess(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    sheet: GradebookSheet,
    write: boolean,
  ) {
    const definition = storedResultDefinition(
      sheet.draftDefinition?.configuration,
    );
    if (!definition)
      return new Map<
        string,
        { readable: boolean; editable: boolean; hiddenDependencies: boolean }
      >();
    const grants = await this.auth.fieldGrants(
      client,
      access.actor,
      sheet,
      true,
    );
    return resultFieldAccess({
      definition,
      accepted: storedResultDefinition(sheet.acceptedDefinition?.configuration),
      teacher: false,
      grants,
      canEdit:
        write && access.permissions.has('official_results.entries.manage'),
    });
  }

  private async plan(
    client: Prisma.TransactionClient,
    sheet: GradebookSheet,
    context: Context,
    input: RosterPreviewInput,
    write: boolean,
  ) {
    if (sheet.rosterGeneration !== input.expectedRosterGeneration)
      throw new OfficialResultsError('roster.changed');
    const asOf = new Date(input.rosterAsOf);
    const local = input.selectedSlotIds
      ? []
      : await this.roster.findRoster(client, context, asOf, true);
    assertRosterDate(
      asOf,
      context.period.school.schoolProfile?.timezone ?? 'UTC',
      context.period,
    );
    const localIds = [...new Set(local.map((row) => row.studentId))];
    const slots = await this.edits.placements(
      client,
      sheet,
      localIds,
      input.selectedSlotIds,
    );
    const fromSheet = slots.filter((slot) => slot.sheetId === sheet.id);
    if (slots.length > 25_000)
      throw new OfficialResultsError('scope.limit_exceeded');
    if (
      input.selectedSlotIds &&
      fromSheet.length !== input.selectedSlotIds.length
    )
      throw new NotFoundDomainException();
    const students = [
      ...new Set([...localIds, ...fromSheet.map((slot) => slot.studentId)]),
    ].sort();
    const placements = await this.roster.placements(
      client,
      context.period,
      asOf,
      students,
      write,
    );
    const rooms = [
      ...new Set(
        [...placements.values()].flatMap((rows) =>
          rows.map((row) => row.classroomId),
        ),
      ),
    ].sort();
    const destinationRows = await this.edits.destinationSheets(
      client,
      sheet,
      rooms,
    );
    const destinations = new Map(
      destinationRows.map((row) => [row.classroomId, row]),
    );
    const changes: RosterChange[] = [];
    const existing = new Map(slots.map((slot) => [slot.studentId, slot]));
    for (const studentId of students) {
      const old = existing.get(studentId);
      const current = placements.get(studentId) ?? [];
      const first = current[0];
      const target = first ? destinations.get(first.classroomId) : undefined;
      if (
        !old &&
        (current.length === 0 ||
          (current.length === 1 && first.classroomId !== sheet.classroomId))
      )
        continue;
      if (
        old &&
        old.sheetId !== sheet.id &&
        current.length === 1 &&
        first.classroomId !== sheet.classroomId
      )
        continue;
      let kind: RosterChange['kind'];
      if (current.length > 1) kind = 'AMBIGUOUS';
      else if (!old) kind = 'ADDED';
      else if (old.sheetId !== sheet.id) kind = 'MOVED_IN';
      else if (
        old.rosterState !== 'CLOSED' &&
        !old.historicalPlacement &&
        current.length === 0
      )
        kind = 'WITHDRAWN';
      else if (
        old.rosterState !== 'CLOSED' &&
        !old.historicalPlacement &&
        first &&
        first.id !== old.enrollmentId
      )
        kind = 'MOVED';
      else kind = 'APPLICABILITY';
      changes.push({
        kind,
        studentId,
        slotId: old?.id ?? null,
        placementRevision: old?.placementRevision ?? null,
        enrollmentId: old?.enrollmentId ?? null,
        destinationEnrollmentId: current.length === 1 ? first.id : null,
        destinationSheetId: current.length === 1 ? (target?.id ?? null) : null,
        classroomId: current.length === 1 ? first.classroomId : null,
        groupExempt: old?.groupExempt ?? false,
      });
    }
    const blockers = changes
      .filter(
        (change) => change.kind === 'AMBIGUOUS' || change.kind === 'MOVED_IN',
      )
      .map((change) => ({
        code:
          change.kind === 'AMBIGUOUS'
            ? 'AMBIGUOUS_ENROLLMENT'
            : 'RECONCILE_SOURCE_SHEET',
        studentId: change.studentId,
        slotId: change.slotId,
      }));
    return {
      slots,
      changes,
      blockers,
      fingerprint: resultContentDigest({
        policyVersionId: context.policyVersionId,
        sheetRevision: sheet.sheetRevision,
        rosterGeneration: sheet.rosterGeneration,
        input,
        slots,
        changes,
        enrollmentEvidence: [...placements],
        destinations: destinationRows
          .map((row) => row)
          .sort((a, b) => a.id.localeCompare(b.id)),
      }),
    };
  }
}

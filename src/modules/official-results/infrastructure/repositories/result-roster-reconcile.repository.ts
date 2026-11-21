import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { ResultActor } from '../../application/result-actor';
import { OfficialResultsError } from '../../domain/official-results.error';
import type { ResultFieldAccess } from '../../domain/result-field-access';
import type { RosterDecision } from '../../domain/result-roster-contract';
import {
  cellColumns,
  normalizeManualValue,
  storedCellValue,
} from '../../domain/result-value';
import { storedResultDefinition } from '../../domain/sheet-definition-seed';
import type { GradebookSheet } from './result-gradebook.repository';

const placementSelect = {
  id: true,
  schoolId: true,
  studentId: true,
  reportingPeriodId: true,
  groupId: true,
  sheetId: true,
  enrollmentId: true,
  rosterState: true,
  placementRevision: true,
  revision: true,
  historicalPlacement: true,
  groupExempt: true,
} satisfies Prisma.ResultSlotSelect;
export type SlotPlacement = Prisma.ResultSlotGetPayload<{
  select: typeof placementSelect;
}>;

@Injectable()
export class ResultRosterReconcileRepository {
  async lockSheets(
    client: Prisma.TransactionClient,
    schoolId: string,
    ids: string[],
  ) {
    const keys = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
    const locked = await client.$queryRaw<{ id: string }[]>`
      SELECT id FROM result_sheets WHERE school_id = ${schoolId}::uuid AND id IN (${keys}) ORDER BY id FOR UPDATE
    `;
    if (locked.length !== ids.length) throw new NotFoundDomainException();
  }

  async placements(
    client: Prisma.TransactionClient,
    sheet: GradebookSheet,
    localStudentIds: string[],
    selected?: string[],
  ) {
    return client.resultSlot.findMany({
      where: {
        schoolId: sheet.schoolId,
        reportingPeriodId: sheet.reportingPeriodId,
        groupId: sheet.groupId,
        OR: [
          { sheetId: sheet.id, id: selected ? { in: selected } : undefined },
          { studentId: { in: localStudentIds }, sheetId: { not: sheet.id } },
        ],
      },
      select: placementSelect,
      orderBy: { id: 'asc' },
      take: 25_001,
    });
  }

  destinationSheets(
    client: Prisma.TransactionClient,
    sheet: GradebookSheet,
    classrooms: string[],
  ) {
    return client.resultSheet.findMany({
      where: {
        schoolId: sheet.schoolId,
        reportingPeriodId: sheet.reportingPeriodId,
        groupId: sheet.groupId,
        classroomId: { in: classrooms },
        draftDefinitionVersionId: { not: null },
      },
      select: {
        id: true,
        classroomId: true,
        draftDefinitionVersionId: true,
        sheetRevision: true,
      },
    });
  }

  async add(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    sheet: GradebookSheet,
    studentId: string,
    enrollmentId: string,
    asOf: Date,
  ) {
    const slot = await client.resultSlot.create({
      data: {
        schoolId: sheet.schoolId,
        sheetId: sheet.id,
        reportingPeriodId: sheet.reportingPeriodId,
        groupId: sheet.groupId,
        studentId,
        enrollmentId,
      },
      select: { id: true },
    });
    await client.resultPlacementRevision.create({
      data: {
        schoolId: sheet.schoolId,
        slotId: slot.id,
        studentId,
        reportingPeriodId: sheet.reportingPeriodId,
        groupId: sheet.groupId,
        toSheetId: sheet.id,
        toEnrollmentId: enrollmentId,
        action: 'ADD',
        version: 1,
        authorId: actor.actorId,
        rosterAsOf: asOf,
        reason: 'Added from reviewed eligible enrollment',
      },
      select: { id: true },
    });
  }

  async update(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    slot: SlotPlacement,
    decision: RosterDecision,
    asOf: Date,
  ) {
    const moving = decision.action === 'MOVE_DRAFT';
    const sheetId = moving ? decision.destinationSheetId : slot.sheetId;
    const enrollmentId = moving
      ? decision.destinationEnrollmentId
      : slot.enrollmentId;
    const updated = await client.resultSlot.updateMany({
      where: {
        id: slot.id,
        schoolId: slot.schoolId,
        sheetId: slot.sheetId,
        placementRevision: decision.expectedPlacementRevision,
      },
      data: {
        sheetId,
        enrollmentId,
        placementRevision: { increment: 1 },
        revision: { increment: 1 },
        ...(moving
          ? { rosterState: 'ELIGIBLE' as const, historicalPlacement: false }
          : {}),
        ...(decision.action === 'KEEP_HISTORICAL'
          ? { rosterState: 'ELIGIBLE' as const, historicalPlacement: true }
          : {}),
        ...(decision.action === 'CLOSE_DRAFT'
          ? { rosterState: 'CLOSED' as const }
          : {}),
        ...(decision.action === 'EXEMPT_GROUP' ? { groupExempt: true } : {}),
        ...(decision.action === 'REINSTATE_GROUP'
          ? { groupExempt: false }
          : {}),
      },
    });
    if (updated.count !== 1) throw new OfficialResultsError('roster.changed');
    await client.resultPlacementRevision.create({
      data: {
        schoolId: slot.schoolId,
        slotId: slot.id,
        studentId: slot.studentId,
        reportingPeriodId: slot.reportingPeriodId,
        groupId: slot.groupId,
        version: decision.expectedPlacementRevision + 1,
        action: decision.action,
        fromSheetId: slot.sheetId,
        toSheetId: sheetId,
        fromEnrollmentId: slot.enrollmentId,
        toEnrollmentId: enrollmentId,
        authorId: actor.actorId,
        rosterAsOf: asOf,
        reason: decision.reason,
        ...(moving ? { fieldMapping: decision.fieldMapping } : {}),
      },
      select: { id: true },
    });
  }

  async moveValues(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    slot: SlotPlacement,
    fromSheet: GradebookSheet,
    toSheet: GradebookSheet,
    mapping: Extract<RosterDecision, { action: 'MOVE_DRAFT' }>['fieldMapping'],
    sourceAccess: ResultFieldAccess,
    targetAccess: ResultFieldAccess,
    reason: string,
  ) {
    const from = storedResultDefinition(
      fromSheet.draftDefinition?.configuration,
    );
    const to = storedResultDefinition(toSheet.draftDefinition?.configuration);
    const sourceFields = new Map(
      from?.fields.map((field) => [field.id, field]) ?? [],
    );
    const targetFields = new Map(
      to?.fields.map((field) => [field.id, field]) ?? [],
    );
    const bySource = new Map(mapping.map((item) => [item.fromFieldId, item]));
    const destinations = new Set(
      mapping.flatMap((item) => (item.toFieldId ? [item.toFieldId] : [])),
    );
    if (
      mapping.length !== bySource.size ||
      destinations.size !== mapping.filter((item) => item.toFieldId).length
    ) {
      throw new OfficialResultsError('schema.invalid');
    }
    for (const item of mapping) {
      const source = sourceFields.get(item.fromFieldId);
      const target = item.toFieldId
        ? targetFields.get(item.toFieldId)
        : undefined;
      if (
        !source ||
        source.kind === 'CALCULATED' ||
        (item.action === 'RETIRE' &&
          (item.toFieldId || targetFields.has(source.id))) ||
        (item.action === 'PRESERVE' && source.id !== target?.id) ||
        (item.action === 'COPY' &&
          (!target || source.id === target.id || source.kind !== target.kind))
      ) {
        throw new OfficialResultsError('schema.invalid');
      }
      if (
        !sourceAccess.get(source.id)?.readable ||
        (target &&
          (!targetAccess.get(target.id)?.editable ||
            target.audiences.some(
              (audience) => !source.audiences.includes(audience),
            )))
      ) {
        throw new OfficialResultsError('schema.protected');
      }
    }
    const current = await client.resultCell.findMany({
      where: {
        schoolId: slot.schoolId,
        slotId: slot.id,
        fieldId: {
          in: [...new Set([...sourceFields.keys(), ...destinations])],
        },
      },
    });
    const occupied = new Set(current.map((cell) => cell.fieldId));
    const operationId = randomUUID();
    for (const old of current) {
      if (!sourceFields.has(old.fieldId)) continue;
      const item = bySource.get(old.fieldId);
      if (!item)
        throw new OfficialResultsError('schema.invalid', {
          fieldId: old.fieldId,
          reasonCode: 'MAPPING_REQUIRED',
        });
      if (item.action === 'RETIRE') continue;
      if (item.action === 'COPY' && occupied.has(item.toFieldId!))
        throw new OfficialResultsError('cell.conflict');
      const target = targetFields.get(item.toFieldId!)!;
      const before = storedCellValue(old);
      const after =
        before.status === 'MISSING'
          ? before
          : normalizeManualValue(target, before);
      if (
        target.stateReasonRequired.includes(after.status) &&
        !old.stateReason
      ) {
        throw new OfficialResultsError('cell.reason_required');
      }
      const data = {
        schoolId: slot.schoolId,
        slotId: slot.id,
        fieldId: target.id,
        fieldKind: target.kind,
        definitionVersionId: toSheet.draftDefinitionVersionId!,
        updatedById: actor.actorId,
        stateReason: old.stateReason,
        version: item.action === 'COPY' ? 1 : old.version + 1,
        ...cellColumns(after),
      };
      const cell =
        item.action === 'COPY'
          ? await client.resultCell.create({
              data,
              select: { id: true, version: true },
            })
          : await client.resultCell.update({
              where: { id_schoolId: { id: old.id, schoolId: slot.schoolId } },
              data,
              select: { id: true, version: true },
            });
      await client.resultCellRevision.create({
        data: {
          schoolId: slot.schoolId,
          cellId: cell.id,
          definitionVersionId: toSheet.draftDefinitionVersionId!,
          version: cell.version,
          authorId: actor.actorId,
          operationId,
          source: 'ROSTER_RECONCILIATION',
          before: item.action === 'COPY' ? { status: 'MISSING' } : before,
          after,
          reason,
        },
      });
    }
  }

  async bump(
    client: Prisma.TransactionClient,
    schoolId: string,
    targets: string[],
    rosterAsOf: Date,
  ) {
    await client.resultSheet.updateMany({
      where: { schoolId, id: { in: targets } },
      data: {
        sheetRevision: { increment: 1 },
        rosterGeneration: { increment: 1 },
        dataGeneration: { increment: 1 },
        rosterAsOf,
      },
    });
  }
}

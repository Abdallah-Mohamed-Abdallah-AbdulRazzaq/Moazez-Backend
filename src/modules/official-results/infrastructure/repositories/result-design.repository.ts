import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { ResultActor } from '../../application/result-actor';
import { starterVersionId } from '../../domain/moazez-starter';
import { OfficialResultsError } from '../../domain/official-results.error';
import { resultContentDigest } from '../../domain/result-content-digest';
import type {
  ResultDefinition,
  ResultField,
} from '../../domain/result-definition';
import {
  cellColumns,
  normalizeManualValue,
  storedCellValue,
  type ResultValue,
} from '../../domain/result-value';
import {
  sheetDefinitionSeed,
  storedResultDefinition,
} from '../../domain/sheet-definition-seed';
import { ResultFoundationRepository } from './result-foundation.repository';

export type DraftFieldMapping = {
  fromFieldId: string;
  toFieldId?: string;
  action: 'PRESERVE' | 'COPY' | 'RETIRE';
};

type DraftCellMigration = {
  cellId: string;
  version: number;
  slotId: string;
  oldFieldId: string;
  fieldId: string;
  kind: ResultField['kind'];
  value: ResultValue;
};

const sameDefinition = (a: ResultField, b: ResultField) =>
  resultContentDigest(a) === resultContentDigest(b);
const protectedField = (field: ResultField) =>
  field.readRule !== 'INHERIT_SHEET' ||
  field.editRule === 'SCHOOL_ONLY' ||
  field.editRule === 'EXPLICIT_GRANT';

@Injectable()
export class ResultDesignRepository {
  constructor(private readonly foundation: ResultFoundationRepository) {}

  async sheet(
    client: Prisma.TransactionClient,
    schoolId: string,
    id: string,
    lock: boolean,
  ) {
    if (lock)
      await client.$queryRaw`
      SELECT id FROM result_sheets WHERE school_id = ${schoolId}::uuid AND id = ${id}::uuid FOR UPDATE
    `;
    const sheet = await client.resultSheet.findFirst({
      where: { id, schoolId },
      include: {
        draftDefinition: { select: { configuration: true } },
        acceptedDefinition: { select: { configuration: true } },
        group: { select: { kind: true } },
      },
    });
    if (!sheet || !sheet.draftDefinitionVersionId)
      throw new NotFoundDomainException();
    return {
      ...sheet,
      draft: sheet.draftDefinition
        ? storedResultDefinition(sheet.draftDefinition.configuration)
        : null,
      accepted: sheet.acceptedDefinition
        ? storedResultDefinition(sheet.acceptedDefinition.configuration)
        : null,
    };
  }

  async create(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    sheetId: string,
    definition: ResultDefinition,
    reason: string,
    templateVersionId?: string,
  ) {
    const active = await client.resultDesignCandidate.findFirst({
      where: { schoolId: actor.schoolId, sheetId, status: 'IN_REVIEW' },
      select: { authorId: true },
    });
    if (
      actor.userType === 'TEACHER' &&
      active &&
      active.authorId !== actor.actorId
    ) {
      throw new OfficialResultsError('revision.stale', {
        reasonCode: 'DESIGN_HANDOFF_REQUIRED',
      });
    }
    if (
      templateVersionId &&
      templateVersionId !== starterVersionId &&
      !(await client.resultTemplateVersion.count({
        where: { id: templateVersionId, schoolId: actor.schoolId },
      }))
    )
      throw new NotFoundDomainException();
    const previous = await client.resultSheetDefinitionVersion.findFirst({
      where: { sheetId, schoolId: actor.schoolId },
      select: { version: true },
      orderBy: { version: 'desc' },
    });
    const contentDigest = resultContentDigest(definition);
    const definitionVersionId = await this.foundation.freezeDefinition(
      client,
      actor.schoolId,
      actor.actorId,
      sheetId,
      sheetDefinitionSeed(definition, { templateVersionId }),
      contentDigest,
      (previous?.version ?? 0) + 1,
    );
    await client.resultDesignCandidate.updateMany({
      where: { schoolId: actor.schoolId, sheetId, status: 'IN_REVIEW' },
      data: { status: 'SUPERSEDED' },
    });
    const candidate = await client.resultDesignCandidate.create({
      data: {
        schoolId: actor.schoolId,
        sheetId,
        definitionVersionId,
        authorId: actor.actorId,
        reason,
      },
      select: { id: true, status: true },
    });
    await client.resultSheet.updateMany({
      where: { id: sheetId, schoolId: actor.schoolId },
      data: { sheetRevision: { increment: 1 } },
    });
    return {
      candidateId: candidate.id,
      definitionVersionId,
      contentDigest,
      status: candidate.status,
      definition,
    };
  }

  async candidate(
    client: Prisma.TransactionClient,
    schoolId: string,
    id: string,
  ) {
    const candidate = await client.resultDesignCandidate.findFirst({
      where: { id, schoolId },
      include: {
        definitionVersion: {
          select: { contentDigest: true, configuration: true },
        },
      },
    });
    if (!candidate) throw new NotFoundDomainException();
    return candidate;
  }

  async decide(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    id: string,
    input: {
      definitionVersionId: string;
      contentDigest: string;
      decision: 'APPROVE' | 'RETURN';
      comment?: string;
    },
  ) {
    const candidate = await this.candidate(client, actor.schoolId, id);
    if (
      candidate.definitionVersionId !== input.definitionVersionId ||
      candidate.definitionVersion.contentDigest !== input.contentDigest
    )
      throw new OfficialResultsError('schema.stale');
    const status = input.decision === 'APPROVE' ? 'ACCEPTED' : 'RETURNED';
    const update = await client.resultDesignCandidate.updateMany({
      where: { id, schoolId: actor.schoolId, status: 'IN_REVIEW' },
      data: {
        status,
        decisionActorId: actor.actorId,
        decisionComment: input.comment,
        decidedAt: new Date(),
      },
    });
    if (update.count !== 1) throw new OfficialResultsError('revision.stale');
    if (status === 'ACCEPTED') {
      await client.resultSheet.updateMany({
        where: { id: candidate.sheetId, schoolId: actor.schoolId },
        data: {
          lastAcceptedDefinitionVersionId: candidate.definitionVersionId,
          sheetRevision: { increment: 1 },
        },
      });
    }
    return {
      candidateId: id,
      definitionVersionId: candidate.definitionVersionId,
      contentDigest: input.contentDigest,
      status,
      definition: storedResultDefinition(
        candidate.definitionVersion.configuration,
      ),
      ...(input.comment ? { comment: input.comment } : {}),
    };
  }

  async planAdoption(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    sheet: Awaited<ReturnType<ResultDesignRepository['sheet']>>,
    targetDefinitionVersionId: string,
    mapping: DraftFieldMapping[],
    schoolApproval: boolean,
  ) {
    if (targetDefinitionVersionId === sheet.draftDefinitionVersionId)
      throw new OfficialResultsError('schema.stale');
    const version = await client.resultSheetDefinitionVersion.findFirst({
      where: {
        id: targetDefinitionVersionId,
        schoolId: actor.schoolId,
        sheetId: sheet.id,
      },
      select: { id: true, configuration: true, contentDigest: true },
    });
    const candidate = await client.resultDesignCandidate.findFirst({
      where: {
        schoolId: actor.schoolId,
        sheetId: sheet.id,
        definitionVersionId: targetDefinitionVersionId,
      },
      select: { status: true },
    });
    if (!version || !candidate) throw new NotFoundDomainException();
    if (candidate.status !== 'IN_REVIEW' && candidate.status !== 'ACCEPTED') {
      throw new OfficialResultsError('schema.stale');
    }
    const definition = storedResultDefinition(version.configuration);
    if (!definition) throw new OfficialResultsError('schema.invalid');
    const next = new Map(definition.fields.map((item) => [item.id, item]));
    const old = new Map(
      sheet.draft?.fields.map((item) => [item.id, item]) ?? [],
    );
    const accepted = new Map(
      sheet.accepted?.fields.map((item) => [item.id, item]) ?? [],
    );
    const teacher = actor.userType === 'TEACHER';
    const inaccessible = new Set<string>();
    const allowWidening =
      !teacher && schoolApproval && candidate.status === 'ACCEPTED';
    if (teacher || !allowWidening) {
      for (const [id, field] of old) {
        const prior = accepted.get(id);
        if (protectedField(field) || (prior && protectedField(prior))) {
          if (teacher) inaccessible.add(id);
          const desired = next.get(id);
          if (!desired || !sameDefinition(field, desired))
            throw new OfficialResultsError('schema.protected');
        }
      }
    }
    const explicit = new Map(mapping.map((item) => [item.fromFieldId, item]));
    if (explicit.size !== mapping.length)
      throw new OfficialResultsError('schema.invalid', {
        path: 'fieldMapping',
      });
    const targets = mapping.flatMap((item) =>
      item.toFieldId ? [item.toFieldId] : [],
    );
    if (new Set(targets).size !== targets.length)
      throw new OfficialResultsError('schema.invalid', {
        path: 'fieldMapping',
      });
    for (const item of mapping) {
      const from = old.get(item.fromFieldId);
      const to = item.toFieldId && next.get(item.toFieldId);
      if (
        !from ||
        (item.action !== 'RETIRE' && !to) ||
        (item.action === 'PRESERVE' && from.id !== (to && to.id)) ||
        (item.action === 'COPY' &&
          (from.id === (to && to.id) || from.kind !== (to && to.kind))) ||
        (item.action === 'RETIRE' && (item.toFieldId || next.has(from.id)))
      ) {
        throw new OfficialResultsError('schema.invalid', {
          path: 'fieldMapping',
        });
      }
      if (inaccessible.has(from.id) && item.action !== 'PRESERVE')
        throw new OfficialResultsError('schema.protected');
      if (to && teacher && protectedField(to) && item.action === 'COPY')
        throw new OfficialResultsError('schema.protected');
      if (
        to &&
        to.audiences.some((audience) => !from.audiences.includes(audience)) &&
        !allowWidening
      ) {
        throw new OfficialResultsError('schema.protected');
      }
    }

    const rows = await client.resultCell.findMany({
      where: {
        schoolId: actor.schoolId,
        slot: { sheetId: sheet.id, schoolId: actor.schoolId },
        fieldId: { in: [...old.keys()].filter((id) => !inaccessible.has(id)) },
      },
      orderBy: [{ slotId: 'asc' }, { fieldId: 'asc' }],
      take: 10_001,
    });
    if (rows.length > 10_000)
      throw new OfficialResultsError('scope.limit_exceeded');
    const copyTargets = mapping
      .filter((item) => item.action === 'COPY')
      .map((item) => item.toFieldId!);
    const occupiedTargets = await client.resultCell.findMany({
      where: {
        schoolId: actor.schoolId,
        slot: { sheetId: sheet.id, schoolId: actor.schoolId },
        fieldId: { in: copyTargets },
      },
      select: { id: true, slotId: true, fieldId: true, version: true },
      orderBy: [{ slotId: 'asc' }, { fieldId: 'asc' }],
      take: 10_001,
    });
    if (occupiedTargets.length > 10_000)
      throw new OfficialResultsError('scope.limit_exceeded');
    const occupied = new Set(
      occupiedTargets.map((cell) => cell.slotId + ':' + cell.fieldId),
    );
    const mutations: DraftCellMigration[] = [];
    const blockers: { fieldId: string; code: string }[] = [];
    for (const cell of rows) {
      const item = explicit.get(cell.fieldId);
      const desired =
        item?.action === 'COPY'
          ? next.get(item.toFieldId!)
          : next.get(cell.fieldId);
      if (item?.action === 'RETIRE') continue;
      if (
        item?.action === 'COPY' &&
        occupied.has(cell.slotId + ':' + item.toFieldId)
      ) {
        blockers.push({ fieldId: cell.fieldId, code: 'TARGET_HAS_VALUE' });
        continue;
      }
      if (!desired) {
        blockers.push({ fieldId: cell.fieldId, code: 'MAPPING_REQUIRED' });
        continue;
      }
      if (
        !item &&
        next.has(cell.fieldId) &&
        sameDefinition(old.get(cell.fieldId)!, desired)
      )
        continue;
      if (!item) {
        blockers.push({ fieldId: cell.fieldId, code: 'MAPPING_REQUIRED' });
        continue;
      }
      try {
        const value = normalizeManualValue(desired, storedCellValue(cell));
        mutations.push({
          cellId: cell.id,
          version: cell.version,
          slotId: cell.slotId,
          oldFieldId: cell.fieldId,
          fieldId: desired.id,
          kind: desired.kind,
          value,
        });
      } catch (error) {
        if (
          !(error instanceof OfficialResultsError) ||
          error.code !== 'official_results.cell.invalid_value'
        )
          throw error;
        blockers.push({
          fieldId: cell.fieldId,
          code: 'VALUE_INVALID_FOR_TARGET',
        });
      }
    }
    const fingerprint = resultContentDigest({
      sheetId: sheet.id,
      sheetRevision: sheet.sheetRevision,
      oldDefinitionId: sheet.draftDefinitionVersionId,
      acceptedDefinitionVersionId: sheet.lastAcceptedDefinitionVersionId,
      targetDefinitionVersionId,
      contentDigest: version.contentDigest,
      mapping,
      candidateStatus: candidate.status,
      versions: [...rows, ...occupiedTargets].map(({ id, version }) => ({
        id,
        version,
      })),
    });
    return {
      fingerprint,
      mutations,
      impact: {
        targetDefinitionVersionId,
        expectedSheetRevision: sheet.sheetRevision,
        affectedValues: mutations.length,
        blockers: [
          ...new Map(
            blockers.map((item) => [`${item.fieldId}:${item.code}`, item]),
          ).values(),
        ],
        addedFieldIds: [...next.keys()].filter((id) => !old.has(id)),
        retiredFieldIds: [...old.keys()].filter(
          (id) => !next.has(id) && !inaccessible.has(id),
        ),
      },
    };
  }

  async adopt(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    sheet: Awaited<ReturnType<ResultDesignRepository['sheet']>>,
    targetDefinitionVersionId: string,
    plan: Awaited<ReturnType<ResultDesignRepository['planAdoption']>>,
  ) {
    if (plan.impact.blockers.length)
      throw new OfficialResultsError('schema.invalid');
    const operationId = randomUUID();
    for (const mutation of plan.mutations) {
      const old = await client.resultCell.findFirst({
        where: {
          id: mutation.cellId,
          schoolId: actor.schoolId,
          version: mutation.version,
        },
      });
      if (!old) throw new OfficialResultsError('preview.stale');
      const copy = mutation.oldFieldId !== mutation.fieldId;
      const data = {
        schoolId: actor.schoolId,
        slotId: mutation.slotId,
        definitionVersionId: targetDefinitionVersionId,
        fieldId: mutation.fieldId,
        fieldKind: mutation.kind,
        updatedById: actor.actorId,
        version: copy ? 1 : mutation.version + 1,
        ...cellColumns(mutation.value),
      };
      const cell = copy
        ? await client.resultCell.create({
            data,
            select: { id: true, version: true },
          })
        : await client.resultCell.update({
            where: {
              id_schoolId: { id: mutation.cellId, schoolId: actor.schoolId },
            },
            data,
            select: { id: true, version: true },
          });
      await client.resultCellRevision.create({
        data: {
          schoolId: actor.schoolId,
          cellId: cell.id,
          definitionVersionId: targetDefinitionVersionId,
          version: cell.version,
          authorId: actor.actorId,
          source: 'DEFINITION_UPGRADE',
          operationId,
          before: copy ? { status: 'MISSING' } : storedCellValue(old),
          after: mutation.value,
        },
      });
    }
    await client.resultSlot.updateMany({
      where: { schoolId: actor.schoolId, sheetId: sheet.id },
      data: { revision: { increment: 1 } },
    });
    const updated = await client.resultSheet.update({
      where: { id_schoolId: { id: sheet.id, schoolId: actor.schoolId } },
      data: {
        draftDefinitionVersionId: targetDefinitionVersionId,
        sheetRevision: { increment: 1 },
        dataGeneration: { increment: 1 },
      },
      select: {
        id: true,
        classroomId: true,
        reportingPeriodId: true,
        groupId: true,
        sheetRevision: true,
        dataGeneration: true,
        rosterGeneration: true,
        draftDefinitionVersionId: true,
        lastAcceptedDefinitionVersionId: true,
      },
    });
    const { id, ...value } = updated;
    return { sheetId: id, ...value };
  }
}

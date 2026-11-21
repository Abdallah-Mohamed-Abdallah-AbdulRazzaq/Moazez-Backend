import { Injectable } from '@nestjs/common';
import type { OfficialResultScopeGrant, Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { ResultActor } from '../../application/result-actor';
import type {
  ResultCorrectionWindowInput,
  ResultGrantInput,
} from '../../application/result-grant.types';
import { OfficialResultsError } from '../../domain/official-results.error';

export function presentResultGrant(row: OfficialResultScopeGrant) {
  return {
    grantId: row.id,
    grantee: row.granteeUserId
      ? { kind: 'USER', id: row.granteeUserId }
      : { kind: 'ROLE', id: row.granteeRoleId },
    scope: {
      reportingPeriodIds: row.reportingPeriodIds,
      groupIds: row.groupIds,
      classroomIds: row.classroomIds,
      fieldIds: row.fieldIds,
    },
    actions: row.actions,
    reason: row.reason,
    startsAt: row.startsAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revision: row.revision,
  };
}

@Injectable()
export class ResultGrantRepository {
  list(
    client: Prisma.TransactionClient,
    schoolId: string,
    limit: number,
    after: string | null,
  ) {
    return client.officialResultScopeGrant.findMany({
      where: { schoolId, id: after ? { gt: after } : undefined },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
  }

  async create(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    input: ResultGrantInput,
  ) {
    const { schoolId } = actor;
    const {
      reportingPeriodIds,
      groupIds,
      classroomIds,
      fieldIds = [],
    } = input.scope;
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= startsAt)
      throw new OfficialResultsError('grant.invalid');

    const [periods, groups, classrooms, fields] = await Promise.all([
      client.resultReportingPeriod.count({
        where: { schoolId, id: { in: reportingPeriodIds } },
      }),
      client.resultGroup.count({
        where: { schoolId, id: { in: groupIds }, archivedAt: null },
      }),
      client.classroom.count({
        where: {
          schoolId,
          id: { in: classroomIds },
          deletedAt: null,
          section: {
            deletedAt: null,
            grade: { deletedAt: null, stage: { deletedAt: null } },
          },
        },
      }),
      client.resultFieldIdentity.count({
        where: { schoolId, id: { in: fieldIds }, retiredAt: null },
      }),
    ]);
    if (
      periods !== reportingPeriodIds.length ||
      groups !== groupIds.length ||
      classrooms !== classroomIds.length ||
      fields !== fieldIds.length
    ) {
      throw new NotFoundDomainException();
    }
    if (input.grantee.kind === 'USER') {
      await this.requireCurrentActors(client, actor.schoolId, [
        input.grantee.id,
      ]);
    } else {
      const roles = await client.$queryRaw<Array<{ id: string }>>`
        SELECT r.id FROM roles r
        WHERE r.id = ${input.grantee.id}::uuid AND r.deleted_at IS NULL
          AND (r.school_id = ${schoolId}::uuid OR (r.school_id IS NULL AND r.is_system = true AND r.key = 'teacher'))
        FOR SHARE OF r
      `;
      if (roles.length !== 1) throw new NotFoundDomainException();
    }

    return client.officialResultScopeGrant.create({
      data: {
        schoolId,
        granteeUserId: input.grantee.kind === 'USER' ? input.grantee.id : null,
        granteeRoleId: input.grantee.kind === 'ROLE' ? input.grantee.id : null,
        issuerId: actor.actorId,
        startsAt,
        expiresAt,
        reportingPeriodIds,
        groupIds,
        classroomIds,
        fieldIds,
        actions: input.actions,
        reason: input.reason,
      },
    });
  }

  async revoke(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    grantId: string,
    input: { expectedRevision: number; reason: string },
  ) {
    const scope = { id: grantId, schoolId: actor.schoolId };
    const grant = await client.officialResultScopeGrant.findFirst({
      where: scope,
      select: { id: true },
    });
    if (!grant) throw new NotFoundDomainException();
    const update = await client.officialResultScopeGrant.updateMany({
      where: { ...scope, revision: input.expectedRevision, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedById: actor.actorId,
        revocationReason: input.reason,
        revision: { increment: 1 },
      },
    });
    if (update.count !== 1) throw new OfficialResultsError('revision.stale');
    return client.officialResultScopeGrant.findFirstOrThrow({ where: scope });
  }

  period(client: Prisma.TransactionClient, schoolId: string, id: string) {
    return client.resultReportingPeriod.findFirstOrThrow({
      where: { schoolId, id },
    });
  }

  async openCorrectionWindows(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    reportingPeriodId: string,
    input: ResultCorrectionWindowInput,
  ) {
    const expiry = new Date(input.expiresAt);
    const now = new Date();
    const { schoolId } = actor;
    if (expiry <= now || expiry.getTime() > now.getTime() + 24 * 60 * 60_000) {
      throw new OfficialResultsError('correction_window.invalid');
    }
    const [period] = await client.$queryRaw<
      Array<{ revision: number; status: string }>
    >`
      SELECT revision, status::text FROM result_reporting_periods
      WHERE id = ${reportingPeriodId}::uuid AND school_id = ${schoolId}::uuid FOR SHARE
    `;
    if (!period) throw new NotFoundDomainException();
    if (period.revision !== input.expectedPeriodRevision)
      throw new OfficialResultsError('revision.stale');
    if (period.status === 'OPEN')
      throw new OfficialResultsError('correction_window.invalid');

    const targetKeys = new Set(
      input.targets.map(
        ({ slotId, releaseUnitId }) => `${slotId}:${releaseUnitId}`,
      ),
    );
    if (targetKeys.size !== input.targets.length)
      throw new OfficialResultsError('correction_window.invalid');
    const allActors = [
      ...new Set(
        input.targets.flatMap(({ authorizedActorIds }) => authorizedActorIds),
      ),
    ].sort();
    if (allActors.length > 200)
      throw new OfficialResultsError('correction_window.invalid');
    await this.requireCurrentActors(client, schoolId, allActors);
    const slotIds = [...new Set(input.targets.map(({ slotId }) => slotId))];
    const slots = await client.resultSlot.findMany({
      where: { schoolId, reportingPeriodId, id: { in: slotIds } },
      select: {
        id: true,
        sheet: {
          select: {
            draftDefinition: {
              select: { releaseUnits: { select: { unitId: true } } },
            },
          },
        },
      },
    });
    if (slots.length !== slotIds.length) throw new NotFoundDomainException();
    const unitsBySlot = new Map(
      slots.map((slot) => [
        slot.id,
        new Set(
          slot.sheet.draftDefinition?.releaseUnits.map(
            ({ unitId }) => unitId,
          ) ?? [],
        ),
      ]),
    );
    if (
      input.targets.some(
        ({ slotId, releaseUnitId }) =>
          !unitsBySlot.get(slotId)?.has(releaseUnitId),
      )
    ) {
      throw new NotFoundDomainException();
    }
    const records = input.targets.flatMap(
      ({ slotId, releaseUnitId, authorizedActorIds }) =>
        authorizedActorIds.map((actorId) => ({
          schoolId,
          reportingPeriodId,
          slotId,
          releaseUnitId,
          actorId,
          issuerId: actor.actorId,
          reason: input.reason,
          expiresAt: expiry,
        })),
    );
    if (records.length > 1000)
      throw new OfficialResultsError('correction_window.invalid');
    const stored = await client.resultCorrectionWindow.createManyAndReturn({
      data: records,
      select: { id: true, slotId: true, releaseUnitId: true, actorId: true },
    });
    return {
      reportingPeriodId,
      expiresAt: expiry.toISOString(),
      windows: stored.map(({ id, ...target }) => ({ windowId: id, ...target })),
    };
  }

  private async requireCurrentActors(
    client: Prisma.TransactionClient,
    schoolId: string,
    ids: string[],
  ) {
    const count = await client.user.count({
      where: {
        id: { in: ids },
        status: 'ACTIVE',
        deletedAt: null,
        userType: { in: ['TEACHER', 'SCHOOL_USER', 'ORGANIZATION_USER'] },
        memberships: {
          some: { schoolId, status: 'ACTIVE', deletedAt: null, endedAt: null },
        },
      },
    });
    if (count !== ids.length) throw new NotFoundDomainException();
  }
}

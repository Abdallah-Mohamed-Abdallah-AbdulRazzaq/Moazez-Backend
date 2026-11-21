import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  ResultGroupKind,
  ResultReportingPeriodKind,
  ResultReportingPeriodStatus,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { ResultActor } from '../../application/result-actor';
import type { ResultLabel } from '../../application/result-foundation.types';
import { OfficialResultsError } from '../../domain/official-results.error';
import {
  assertReportingDates,
  parseReportingDate,
} from '../../domain/reporting-dates';

export interface PeriodFilters {
  academicYearId?: string;
  kind?: ResultReportingPeriodKind;
  status?: ResultReportingPeriodStatus;
}
export interface GroupFilters {
  kind?: ResultGroupKind;
  subjectId?: string;
  archived?: boolean;
}

@Injectable()
export class ResultCatalogRepository {
  async visibleIds(client: Prisma.TransactionClient, actor: ResultActor) {
    if (actor.userType !== 'TEACHER') return {};
    const schoolId = actor.schoolId;
    const now = new Date();
    const [allocations, grants] = await Promise.all([
      client.teacherSubjectAllocation.findMany({
        where: {
          schoolId,
          teacherUserId: actor.actorId,
          term: { deletedAt: null, academicYear: { deletedAt: null } },
          subject: { deletedAt: null, isActive: true },
          classroom: {
            deletedAt: null,
            section: {
              deletedAt: null,
              grade: {
                deletedAt: null,
                stage: { deletedAt: null },
              },
            },
          },
        },
        select: {
          subjectId: true,
          termId: true,
          classroom: { select: { section: { select: { gradeId: true } } } },
        },
      }),
      client.officialResultScopeGrant.findMany({
        where: {
          schoolId,
          AND: [
            {
              OR: [
                { granteeUserId: actor.actorId },
                { granteeRoleId: actor.roleId },
              ],
            },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ],
          startsAt: { lte: now },
          revokedAt: null,
          actions: { has: 'VIEW' },
          fieldIds: { isEmpty: true },
        },
        select: { reportingPeriodIds: true, groupIds: true },
      }),
    ]);
    const subjectIds = [
      ...new Set(allocations.map((allocation) => allocation.subjectId)),
    ];
    const termIds = [
      ...new Set(allocations.map((allocation) => allocation.termId)),
    ];
    const gradeIds = [
      ...new Set(
        allocations.map((allocation) => allocation.classroom.section.gradeId),
      ),
    ];
    const offerings = await client.subjectAllocation.findMany({
      where: {
        schoolId,
        subjectId: { in: subjectIds },
        termId: { in: termIds },
        gradeId: { in: gradeIds },
        deletedAt: null,
      },
      select: { subjectId: true, termId: true, gradeId: true },
    });
    const offerKey = (termId: string, subjectId: string, gradeId: string) =>
      `${termId}:${subjectId}:${gradeId}`;
    const available = new Set(
      offerings.map((offering) =>
        offerKey(offering.termId, offering.subjectId, offering.gradeId),
      ),
    );
    const current = allocations.filter((allocation) =>
      available.has(
        offerKey(
          allocation.termId,
          allocation.subjectId,
          allocation.classroom.section.gradeId,
        ),
      ),
    );
    const [periods, groups] = await Promise.all([
      client.resultReportingPeriod.findMany({
        where: {
          schoolId,
          termId: { in: current.map(({ termId }) => termId) },
        },
        select: { id: true },
      }),
      client.resultGroup.findMany({
        where: {
          schoolId,
          subjectId: { in: current.map(({ subjectId }) => subjectId) },
          archivedAt: null,
        },
        select: { id: true },
      }),
    ]);
    return {
      periodIds: [
        ...new Set([
          ...periods.map(({ id }) => id),
          ...grants.flatMap(({ reportingPeriodIds }) => reportingPeriodIds),
        ]),
      ],
      groupIds: [
        ...new Set([
          ...groups.map(({ id }) => id),
          ...grants.flatMap(({ groupIds }) => groupIds),
        ]),
      ],
    };
  }

  listPeriods(
    client: Prisma.TransactionClient,
    schoolId: string,
    ids: string[] | undefined,
    filters: PeriodFilters,
    limit: number,
    after: string | null,
    sort: 'ID_ASC' | 'ID_DESC',
  ) {
    return client.resultReportingPeriod.findMany({
      where: {
        schoolId,
        academicYear: { deletedAt: null },
        ...filters,
        id: {
          in: ids,
          gt: sort === 'ID_ASC' ? (after ?? undefined) : undefined,
          lt: sort === 'ID_DESC' ? (after ?? undefined) : undefined,
        },
      },
      orderBy: { id: sort === 'ID_ASC' ? 'asc' : 'desc' },
      take: limit + 1,
    });
  }

  listGroups(
    client: Prisma.TransactionClient,
    schoolId: string,
    ids: string[] | undefined,
    filters: GroupFilters,
    limit: number,
    after: string | null,
    sort: 'ID_ASC' | 'ID_DESC',
  ) {
    const { archived, ...where } = filters;
    return client.resultGroup.findMany({
      where: {
        schoolId,
        ...where,
        archivedAt:
          archived === undefined ? undefined : archived ? { not: null } : null,
        id: {
          in: ids,
          gt: sort === 'ID_ASC' ? (after ?? undefined) : undefined,
          lt: sort === 'ID_DESC' ? (after ?? undefined) : undefined,
        },
      },
      orderBy: { id: sort === 'ID_ASC' ? 'asc' : 'desc' },
      take: limit + 1,
    });
  }

  async capabilityTarget(
    client: Prisma.TransactionClient,
    schoolId: string,
    query: {
      sheetId?: string;
      slotId?: string;
      reportingPeriodId?: string;
      groupId?: string;
    },
  ) {
    if (!query.sheetId && !query.slotId) {
      const [period, group] = await Promise.all([
        query.reportingPeriodId
          ? client.resultReportingPeriod.count({
              where: { schoolId, id: query.reportingPeriodId },
            })
          : 1,
        query.groupId
          ? client.resultGroup.count({ where: { schoolId, id: query.groupId } })
          : 1,
      ]);
      if (!period || !group) throw new NotFoundDomainException();
      return null;
    }
    const sheet = await client.resultSheet.findFirst({
      where: {
        schoolId,
        id: query.sheetId,
        reportingPeriodId: query.reportingPeriodId,
        groupId: query.groupId,
        slots: query.slotId
          ? { some: { schoolId, id: query.slotId } }
          : undefined,
      },
      select: {
        id: true,
        reportingPeriodId: true,
        classroomId: true,
        groupId: true,
      },
    });
    if (!sheet) throw new NotFoundDomainException();
    return sheet;
  }

  async editPeriod(
    client: Prisma.TransactionClient,
    schoolId: string,
    id: string,
    expectedRevision: number,
    patch: {
      name?: ResultLabel;
      description?: string;
      startsOn?: string;
      endsOn?: string;
    },
  ) {
    const current = await client.resultReportingPeriod.findFirst({
      where: { schoolId, id },
      include: {
        academicYear: {
          select: { startDate: true, endDate: true, deletedAt: true },
        },
        term: { select: { startDate: true, endDate: true, deletedAt: true } },
      },
    });
    if (!current || current.academicYear.deletedAt || current.term?.deletedAt)
      throw new NotFoundDomainException();
    if (current.revision !== expectedRevision)
      throw new OfficialResultsError('revision.stale');
    const startsOn = patch.startsOn
      ? parseReportingDate(patch.startsOn)
      : current.startsOn;
    const endsOn = patch.endsOn
      ? parseReportingDate(patch.endsOn)
      : current.endsOn;
    if (
      startsOn.getTime() !== current.startsOn.getTime() ||
      endsOn.getTime() !== current.endsOn.getTime()
    ) {
      await client.$queryRaw`
        SELECT id FROM result_reporting_periods
        WHERE id = ${id}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE
      `;
      const used = await client.resultSheet.count({
        where: { schoolId, reportingPeriodId: id },
      });
      if (used || current.status !== 'OPEN')
        throw new OfficialResultsError('period.used_dates');
      assertReportingDates(startsOn, endsOn, current.academicYear);
      if (current.term) assertReportingDates(startsOn, endsOn, current.term);
    }
    const update = await client.resultReportingPeriod.updateMany({
      where: { id, schoolId, revision: expectedRevision },
      data: {
        startsOn,
        endsOn,
        nameAr: patch.name?.ar,
        nameEn: patch.name?.en,
        description: patch.description,
        revision: { increment: 1 },
      },
    });
    if (!update.count) throw new OfficialResultsError('revision.stale');
    return client.resultReportingPeriod.findFirstOrThrow({
      where: { schoolId, id },
    });
  }

  async editGroup(
    client: Prisma.TransactionClient,
    schoolId: string,
    id: string,
    expectedRevision: number,
    patch: { label?: ResultLabel; description?: string },
  ) {
    const current = await client.resultGroup.findFirst({
      where: { schoolId, id },
      select: { id: true },
    });
    if (!current) throw new NotFoundDomainException();
    const update = await client.resultGroup.updateMany({
      where: { id, schoolId, revision: expectedRevision },
      data: {
        labelAr: patch.label?.ar,
        labelEn: patch.label?.en,
        description: patch.description,
        revision: { increment: 1 },
      },
    });
    if (update.count !== 1) throw new OfficialResultsError('revision.stale');
    return client.resultGroup.findFirstOrThrow({ where: { schoolId, id } });
  }
}

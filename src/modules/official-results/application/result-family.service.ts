import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod/v4';
import { getRequestContext } from '../../../common/context/request-context';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { OfficialResultsError } from '../domain/official-results.error';
import { resultContentDigest } from '../domain/result-content-digest';
import {
  effectiveResultPolicy,
  managedResultPolicy,
  parseResultPolicy,
} from '../domain/result-policy';
import {
  releaseSnapshot,
  type ReleaseSnapshot,
} from '../domain/result-release.contract';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import {
  ResultFamilyRepository,
  type FamilyOwnership,
  type FamilyPublicationRow,
} from '../infrastructure/repositories/result-family.repository';
import {
  familyGroup,
  familyReleaseContext,
  familyReleaseFields,
} from './result-family.presenter';
import {
  presentResultPage,
  readResultCursor,
  type ResultListQuery,
} from './result-page';

type Audience = 'STUDENT' | 'PARENT';
type RecordSelection = {
  periodId?: string;
  groupId?: string;
  publicationId?: string;
  includeHistory?: boolean;
};
type EntitledRow = FamilyPublicationRow & {
  ownership: FamilyOwnership;
  decoded: ReleaseSnapshot;
};
type PeriodQuery = ResultListQuery & {
  academicYearId?: string;
  kind?: 'TERM' | 'CUSTOM' | 'YEAR';
  status?: 'OPEN' | 'ENTRY_CLOSED' | 'ARCHIVED';
  sort?: 'ID_ASC' | 'ID_DESC';
};
type HistoryQuery = ResultListQuery & {
  groupId?: string;
  publicationId?: string;
  occurredFrom?: string;
  occurredTo?: string;
};

function resultSetUuid(
  schoolId: string,
  studentId: string,
  periodId: string,
): string {
  const hash = resultContentDigest([
    'official-results-period',
    schoolId,
    studentId,
    periodId,
  ]);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '8' + hash.slice(13, 16),
    '8' + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

function historyAllowed(row: EntitledRow) {
  const config = row.policy
    ? parseResultPolicy(row.policy)
    : managedResultPolicy();
  const { academicContext, group } = row.decoded;
  const academic = {
    STAGE: academicContext.stage.id,
    GRADE: academicContext.grade.id,
    SECTION: academicContext.section.id,
    CLASSROOM: academicContext.classroom.id,
  };
  const period = {
    id: row.periodId,
    academicYearId: academicContext.academicYear.id,
    kind: academicContext.reportingPeriod.kind,
    termId: academicContext.term?.id ?? null,
  };
  const facts = {
    paths: {
      STAGE: new Map([[academic.STAGE, academic]]),
      GRADE: new Map([[academic.GRADE, academic]]),
      SECTION: new Map([[academic.SECTION, academic]]),
      CLASSROOM: new Map([[academic.CLASSROOM, academic]]),
    },
    periods: new Map([[period.id, period]]),
  };
  try {
    return effectiveResultPolicy(
      config,
      {
        academic,
        period,
        groupId: group.groupId,
        subjectId: group.subjectId ?? null,
      },
      facts,
    ).settings.familyHistoryEnabled;
  } catch (error) {
    if (
      error instanceof OfficialResultsError &&
      error.code === 'official_results.scope.conflict'
    )
      return false;
    throw error;
  }
}

@Injectable()
export class ResultFamilyService {
  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly repository: ResultFamilyRepository,
  ) {}

  periods(
    audience: Audience,
    studentId: string | undefined,
    query: PeriodQuery,
  ) {
    return this.read(
      audience,
      studentId,
      { includeHistory: true },
      async (_client, rows, binding) => {
        const { cursor, limit: requested, ...filters } = query;
        const { limit, after } = readResultCursor(
          { cursor, limit: requested },
          binding,
          'result-periods',
          filters,
        );
        const desc = query.sort === 'ID_DESC';
        if (after && !z.uuid().safeParse(after).success)
          throw new ValidationDomainException('Invalid period cursor');
        const periods = new Map<
          string,
          {
            reportingPeriodId: string;
            academicYearId: string;
            termId?: string;
            kind: ReleaseSnapshot['academicContext']['reportingPeriod']['kind'];
            name: ReleaseSnapshot['academicContext']['reportingPeriod']['name'];
            status: FamilyPublicationRow['periodStatus'];
            startsOn: string;
            endsOn: string;
          }
        >();
        for (const item of rows) {
          if (
            (filters.kind &&
              filters.kind !==
                item.decoded.academicContext.reportingPeriod.kind) ||
            (filters.academicYearId &&
              filters.academicYearId !==
                item.decoded.academicContext.academicYear.id) ||
            (filters.status && filters.status !== item.periodStatus) ||
            (after && (desc ? item.periodId >= after : item.periodId <= after))
          )
            continue;
          const ctx = item.decoded.academicContext;
          if (!periods.has(item.periodId))
            periods.set(item.periodId, {
              reportingPeriodId: item.periodId,
              academicYearId: ctx.academicYear.id,
              ...(ctx.term ? { termId: ctx.term.id } : {}),
              kind: ctx.reportingPeriod.kind,
              name: ctx.reportingPeriod.name,
              status: item.periodStatus,
              startsOn: item.startsOn.toISOString().slice(0, 10),
              endsOn: item.endsOn.toISOString().slice(0, 10),
            });
        }
        const items = [...periods.values()].sort(
          (a, b) =>
            (desc ? -1 : 1) *
            a.reportingPeriodId.localeCompare(b.reportingPeriodId),
        );
        return presentResultPage(
          items,
          limit,
          (item) => item.reportingPeriodId,
          binding,
          'result-periods',
          filters,
        );
      },
    );
  }

  result(
    audience: Audience,
    studentId: string | undefined,
    selection: RecordSelection,
  ) {
    return this.read(audience, studentId, selection, async (client, rows) => {
      const first = rows[0];
      if (
        !first ||
        rows.some(
          (row) =>
            row.schoolId !== first.schoolId ||
            row.studentId !== first.studentId ||
            row.periodId !== first.periodId,
        )
      ) {
        throw new NotFoundDomainException();
      }
      const { academicContext, student } = familyReleaseContext(first.decoded);
      const groups = new Map<
        string,
        ReturnType<typeof familyGroup> & {
          releases: ReturnType<ResultFamilyService['release']>[];
        }
      >();
      for (const row of rows) {
        const group = groups.get(row.groupId) ?? {
          ...familyGroup(row.decoded),
          releases: [],
        };
        group.releases.push(this.release(row, audience));
        groups.set(row.groupId, group);
      }
      const entries = [...groups.values()]
        .sort((a, b) => a.groupId.localeCompare(b.groupId))
        .map((item, order) => ({
          ...item,
          order,
          releases: item.releases.sort((a, b) =>
            a.releaseUnitId.localeCompare(b.releaseUnitId),
          ),
        }));
      const aggregate =
        selection.groupId || selection.publicationId
          ? []
          : await this.repository.aggregates(
              client,
              first.ownership,
              first.periodId,
            );
      const visible = aggregate.filter((item) =>
        z
          .object({
            audiences: z.array(z.string()),
          })
          .parse(item.definition)
          .audiences.includes(audience),
      );
      const selected = visible.length === 1 ? visible[0] : undefined;
      const total =
        selected && !selected.stale
          ? z
              .object({
                overallScore: z.string().nullable(),
                overallMaxScore: z.string().nullable(),
                completeness: z.enum(['COMPLETE', 'PARTIAL', 'INCOMPLETE']),
              })
              .parse(selected.computed)
          : null;
      const summary = total
        ? {
            ...total,
            aggregatePublicationId: selected!.id,
            status: 'ACTIVE' as const,
          }
        : {
            status: selected?.stale
              ? ('STALE' as const)
              : ('NOT_CONFIGURED' as const),
            overallScore: null,
            overallMaxScore: null,
            completeness: 'INCOMPLETE' as const,
            reasonCode: selected?.stale
              ? 'official_results.summary.stale'
              : 'official_results.summary.not_configured',
          };
      return {
        schemaVersion: '1.0' as const,
        source: 'OFFICIAL_RESULTS' as const,
        resultSetId: resultSetUuid(
          first.schoolId,
          first.studentId,
          first.periodId,
        ),
        viewVersion: resultContentDigest({
          audience,
          ids: rows.map((row) => row.id).sort(),
          summary,
        }),
        student,
        academicContext,
        groups: entries,
        summary,
      };
    });
  }

  history(
    audience: Audience,
    studentId: string | undefined,
    periodId: string,
    query: HistoryQuery,
  ) {
    const { cursor, limit: requested, ...filters } = query;
    if (
      filters.occurredFrom &&
      filters.occurredTo &&
      new Date(filters.occurredFrom) > new Date(filters.occurredTo)
    ) {
      throw new ValidationDomainException('The history date range is reversed');
    }
    return this.read(
      audience,
      studentId,
      { periodId, includeHistory: true, ...filters },
      async (_client, rows, binding) => {
        if (!rows.length || !rows.some(historyAllowed))
          throw new NotFoundDomainException();
        const { limit, after } = readResultCursor(
          { cursor, limit: requested },
          binding,
          'family-history',
          { periodId, ...filters },
        );
        if (after && !z.uuid().safeParse(after).success)
          throw new ValidationDomainException('Invalid history cursor');
        const matches = rows.filter(
          (row) =>
            historyAllowed(row) &&
            (!after || row.id > after) &&
            (!filters.occurredFrom ||
              row.publishedAt >= new Date(filters.occurredFrom)) &&
            (!filters.occurredTo ||
              row.publishedAt <= new Date(filters.occurredTo)),
        );
        const items = matches
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((row) => ({
            groupId: row.groupId,
            definitionVersionId: row.definitionVersionId,
            ...this.release(row, audience),
          }));
        return presentResultPage(
          items,
          limit,
          (item) => item.publicationId,
          binding,
          'family-history',
          { periodId, ...filters },
        );
      },
    );
  }

  private release(row: EntitledRow, audience: Audience) {
    const { academicPlacement } = familyReleaseContext(row.decoded);
    return {
      publicationId: row.id,
      releaseUnitId: row.decoded.unit.id,
      releaseUnitLabel: row.decoded.unit.label,
      revision: row.revision,
      status: 'PUBLISHED' as const,
      publishedAt: row.publishedAt.toISOString(),
      completeness: row.decoded.completeness,
      academicPlacement,
      fields: familyReleaseFields(
        row.decoded,
        row.definitionVersionId,
        audience,
      ),
    };
  }

  private read<T>(
    audience: Audience,
    studentId: string | undefined,
    selection: RecordSelection,
    present: (
      client: Prisma.TransactionClient,
      rows: EntitledRow[],
      binding: string,
    ) => Promise<T>,
  ) {
    const context = getRequestContext();
    const actor = context?.actor;
    const membership = context?.activeMembership;
    if (
      !actor ||
      actor.userType !== audience ||
      !membership?.schoolId ||
      context.bypass.bypassSchoolScope ||
      (audience === 'PARENT' && !studentId)
    )
      throw new NotFoundDomainException();
    const principal = {
      userId: actor.id,
      schoolId: membership.schoolId,
      membershipId: membership.membershipId,
      audience,
    };
    return this.commands.readSnapshot(async (client) => {
      const proof = await this.repository.ownership(
        client,
        principal,
        studentId,
      );
      if (
        !proof.length &&
        (studentId || selection.periodId || selection.publicationId)
      )
        throw new NotFoundDomainException();
      if (proof.length > 100)
        throw new OfficialResultsError('scope.limit_exceeded');
      const rows: EntitledRow[] = [];
      for (const ownership of proof) {
        const candidates = await this.repository.publications(
          client,
          ownership,
          selection,
        );
        if (candidates.length > 2000)
          throw new OfficialResultsError('scope.limit_exceeded');
        for (const base of candidates) {
          if (base.revoked) continue;
          const decoded = releaseSnapshot.parse(base.snapshot);
          const candidate = { ...base, ownership, decoded };
          if (!candidate.active && !historyAllowed(candidate)) continue;
          if (
            !familyReleaseFields(decoded, base.definitionVersionId, audience)
              .length
          )
            continue;
          rows.push(candidate);
        }
      }
      return present(
        client,
        rows,
        resultContentDigest({ principal, studentId, proof }),
      );
    });
  }
}

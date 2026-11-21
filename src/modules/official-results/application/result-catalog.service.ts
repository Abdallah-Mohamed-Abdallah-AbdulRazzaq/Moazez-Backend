import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  ResultGroup,
  ResultReportingPeriod,
} from '@prisma/client';
import { z } from 'zod/v4';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { ResultAuthorizationRepository } from '../infrastructure/repositories/result-authorization.repository';
import {
  ResultCatalogRepository,
  type GroupFilters,
  type PeriodFilters,
} from '../infrastructure/repositories/result-catalog.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import { ResultFoundationRepository } from '../infrastructure/repositories/result-foundation.repository';
import { requireResultActor } from './result-actor';
import type {
  ReportingPeriodInput,
  ResultGroupInput,
  ResultLabel,
} from './result-foundation.types';
import {
  presentResultPage,
  readResultCursor,
  type ResultListQuery,
} from './result-page';

type Surface = 'SCHOOL' | 'TEACHER';
type CatalogListQuery = ResultListQuery & { sort?: 'ID_ASC' | 'ID_DESC' };

export function presentResultPeriod(row: ResultReportingPeriod) {
  return {
    reportingPeriodId: row.id,
    academicYearId: row.academicYearId,
    ...(row.termId ? { termId: row.termId } : {}),
    kind: row.kind,
    code: row.code,
    name: { ar: row.nameAr, en: row.nameEn },
    ...(row.description ? { description: row.description } : {}),
    startsOn: row.startsOn.toISOString().slice(0, 10),
    endsOn: row.endsOn.toISOString().slice(0, 10),
    classification: row.classification,
    status: row.status,
    revision: row.revision,
  };
}

export function presentResultGroup(row: ResultGroup) {
  return {
    groupId: row.id,
    kind: row.kind,
    code: row.code,
    label: { ar: row.labelAr, en: row.labelEn },
    ...(row.subjectId ? { subjectId: row.subjectId } : {}),
    ...(row.description ? { description: row.description } : {}),
    archived: row.archivedAt !== null,
    revision: row.revision,
  };
}

function assertCursorId(id: string | null): void {
  if (id !== null && !z.uuid().safeParse(id).success) {
    throw new ValidationDomainException('Invalid result resource cursor');
  }
}

@Injectable()
export class ResultCatalogService {
  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly authorization: ResultAuthorizationRepository,
    private readonly catalog: ResultCatalogRepository,
    private readonly foundation: ResultFoundationRepository,
  ) {}

  periods(surface: Surface, query: CatalogListQuery & PeriodFilters) {
    const actor = requireResultActor(surface);
    const { limit: limitValue, cursor, sort = 'ID_ASC', ...filters } = query;
    const binding = `${actor.schoolId}:${actor.actorId}`;
    const { limit, after } = readResultCursor(
      { limit: limitValue, cursor },
      binding,
      'periods',
      { sort, ...filters },
    );
    assertCursorId(after);

    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor);
      this.authorization.requirePermission(
        access,
        'official_results.sheets.view',
      );
      const visible = await this.catalog.visibleIds(client, actor);
      const rows = await this.catalog.listPeriods(
        client,
        actor.schoolId,
        visible.periodIds,
        filters,
        limit,
        after,
        sort,
      );
      return presentResultPage(
        rows.map(presentResultPeriod),
        limit,
        ({ reportingPeriodId }) => reportingPeriodId,
        binding,
        'periods',
        { sort, ...filters },
      );
    });
  }

  groups(surface: Surface, query: CatalogListQuery & GroupFilters) {
    const actor = requireResultActor(surface);
    const { limit: limitValue, cursor, sort = 'ID_ASC', ...filters } = query;
    const binding = `${actor.schoolId}:${actor.actorId}`;
    const { limit, after } = readResultCursor(
      { limit: limitValue, cursor },
      binding,
      'groups',
      { sort, ...filters },
    );
    assertCursorId(after);

    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor);
      this.authorization.requirePermission(
        access,
        'official_results.sheets.view',
      );
      const visible = await this.catalog.visibleIds(client, actor);
      const rows = await this.catalog.listGroups(
        client,
        actor.schoolId,
        visible.groupIds,
        filters,
        limit,
        after,
        sort,
      );
      return presentResultPage(
        rows.map(presentResultGroup),
        limit,
        ({ groupId }) => groupId,
        binding,
        'groups',
        { sort, ...filters },
      );
    });
  }

  createPeriod(input: ReportingPeriodInput, key?: string) {
    return this.write(
      'periods',
      'create',
      input,
      key,
      async (client) => {
        const period = await this.foundation.createReportingPeriod(
          input,
          client,
        );
        return { id: period.id, payload: presentResultPeriod(period) };
      },
      true,
    );
  }

  createGroup(input: ResultGroupInput, key?: string) {
    return this.write(
      'groups',
      'create',
      input,
      key,
      async (client) => {
        const group = await this.foundation.createGroup(input, client);
        return { id: group.id, payload: presentResultGroup(group) };
      },
      true,
    );
  }

  editPeriod(
    id: string,
    input: {
      expectedRevision: number;
      patch: {
        name?: ResultLabel;
        description?: string;
        startsOn?: string;
        endsOn?: string;
      };
    },
    key?: string,
  ) {
    if (!Object.values(input.patch).some((value) => value !== undefined))
      throw new ValidationDomainException('Provide a period change');
    return this.write(
      'periods',
      'update',
      { id, ...input },
      key,
      async (client, schoolId) => {
        const period = await this.catalog.editPeriod(
          client,
          schoolId,
          id,
          input.expectedRevision,
          input.patch,
        );
        return { id: period.id, payload: presentResultPeriod(period) };
      },
      false,
    );
  }

  editGroup(
    id: string,
    input: {
      expectedRevision: number;
      patch: { label?: ResultLabel; description?: string };
    },
    key?: string,
  ) {
    if (!Object.values(input.patch).some((value) => value !== undefined))
      throw new ValidationDomainException('Provide a group change');
    return this.write(
      'groups',
      'update',
      { id, ...input },
      key,
      async (client, schoolId) => {
        const group = await this.catalog.editGroup(
          client,
          schoolId,
          id,
          input.expectedRevision,
          input.patch,
        );
        return { id: group.id, payload: presentResultGroup(group) };
      },
      false,
    );
  }

  private write<T extends Prisma.InputJsonObject>(
    resource: 'periods' | 'groups',
    action: 'create' | 'update',
    request: object,
    key: string | undefined,
    execute: (
      client: Prisma.TransactionClient,
      schoolId: string,
    ) => Promise<{ id: string; payload: T }>,
    requiresKey: boolean,
  ) {
    const actor = requireResultActor('SCHOOL');
    const operation = `${resource}.${action}`;
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor, {
        write: true,
      });
      this.authorization.requirePermission(
        access,
        `official_results.${resource}.manage`,
      );
      const apply = async () => {
        const { id, payload } = await execute(client, actor.schoolId);
        await this.commands.audit(
          client,
          actor,
          operation,
          resource === 'periods' ? 'result_reporting_period' : 'result_group',
          id,
          payload,
        );
        return payload;
      };
      return requiresKey || key !== undefined
        ? this.commands.idempotent(
            client,
            actor,
            operation,
            key,
            request,
            apply,
          )
        : apply();
    });
  }
}

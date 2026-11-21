import { Injectable } from '@nestjs/common';
import type { ResultGrantAction } from '@prisma/client';
import { z } from 'zod/v4';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { ResultAuthorizationRepository } from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import {
  presentResultGrant,
  ResultGrantRepository,
} from '../infrastructure/repositories/result-grant.repository';
import { requireResultActor } from './result-actor';
import { presentResultPeriod } from './result-catalog.service';
import type {
  ResultCorrectionWindowInput,
  ResultGrantInput,
} from './result-grant.types';
import {
  presentResultPage,
  readResultCursor,
  type ResultListQuery,
} from './result-page';

const delegatedPermissions: Record<ResultGrantAction, string[]> = {
  VIEW: ['sheets.view'],
  DESIGN: ['designs.manage'],
  EDIT: ['entries.manage'],
  IMPORT: ['imports.manage'],
  EXPORT: ['exports.create'],
  SUBMIT: ['reviews.submit'],
  PUBLISH: ['publications.publish'],
  REQUEST_CORRECTION: ['corrections.request'],
  PUBLISH_CORRECTION: ['publications.publish', 'publications.correct'],
};

@Injectable()
export class ResultGrantService {
  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly authorization: ResultAuthorizationRepository,
    private readonly grants: ResultGrantRepository,
  ) {}

  list(query: ResultListQuery) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor);
      this.authorization.requirePermission(
        access,
        'official_results.grants.manage',
      );
      const { limit, after } = readResultCursor(
        query,
        actor.schoolId,
        'grants',
      );
      if (after && !z.uuid().safeParse(after).success)
        throw new ValidationDomainException('Invalid grant cursor');
      const rows = await this.grants.list(client, actor.schoolId, limit, after);
      return presentResultPage(
        rows.map(presentResultGrant),
        limit,
        ({ grantId }) => grantId,
        actor.schoolId,
        'grants',
      );
    });
  }

  create(input: ResultGrantInput, key?: string) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor, {
        write: true,
      });
      this.authorization.requirePermission(
        access,
        'official_results.grants.manage',
      );
      for (const permission of new Set(
        input.actions.flatMap((action) => delegatedPermissions[action]),
      )) {
        this.authorization.requirePermission(
          access,
          `official_results.${permission}`,
        );
      }
      return this.commands.idempotent(
        client,
        actor,
        'grants.create',
        key,
        input,
        async () => {
          const stored = await this.grants.create(client, actor, input);
          const grant = presentResultGrant(stored);
          await this.commands.audit(
            client,
            actor,
            'grants.create',
            'result_scope_grant',
            grant.grantId,
            grant,
          );
          return grant;
        },
      );
    });
  }

  revoke(
    id: string,
    input: { expectedRevision: number; reason: string },
    key?: string,
  ) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor, {
        write: true,
      });
      this.authorization.requirePermission(
        access,
        'official_results.grants.manage',
      );
      return this.commands.idempotent(
        client,
        actor,
        'grants.revoke',
        key,
        { id, ...input },
        async () => {
          const row = await this.grants.revoke(client, actor, id, input);
          const grant = presentResultGrant(row);
          await this.commands.audit(
            client,
            actor,
            'grants.revoke',
            'result_scope_grant',
            id,
            {
              revision: grant.revision,
              reason: input.reason,
              revokedAt: grant.revokedAt,
            },
          );
          return grant;
        },
      );
    });
  }

  openCorrectionWindows(
    id: string,
    input: ResultCorrectionWindowInput,
    key?: string,
  ) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor, {
        write: true,
      });
      this.authorization.requirePermission(
        access,
        'official_results.archives.manage',
      );
      return this.commands.idempotent(
        client,
        actor,
        'periods.correction-windows',
        key,
        { id, ...input },
        async () => {
          const outcome = await this.grants.openCorrectionWindows(
            client,
            actor,
            id,
            input,
          );
          await this.commands.audit(
            client,
            actor,
            'periods.correction-windows',
            'result_reporting_period',
            id,
            {
              revision: input.expectedPeriodRevision,
              createdWindowIds: outcome.windows.map(({ windowId }) => windowId),
              reason: input.reason,
              expiresAt: outcome.expiresAt,
            },
          );
          const period = await this.grants.period(client, actor.schoolId, id);
          return {
            ...presentResultPeriod(period),
            correctionWindows: outcome.windows.map((window) => ({
              ...window,
              expiresAt: outcome.expiresAt,
            })),
          };
        },
      );
    });
  }
}

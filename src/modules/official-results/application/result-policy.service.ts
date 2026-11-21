import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { OfficialResultsError } from '../domain/official-results.error';
import { resultContentDigest } from '../domain/result-content-digest';
import { parseResultPolicy } from '../domain/result-policy';
import { ResultAuthorizationRepository } from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import { ResultPolicyRepository } from '../infrastructure/repositories/result-policy.repository';
import { requireResultActor } from './result-actor';
import {
  presentResultPage,
  readResultCursor,
  type ResultListQuery,
} from './result-page';

@Injectable()
export class ResultPolicyService {
  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly authorization: ResultAuthorizationRepository,
    private readonly policies: ResultPolicyRepository,
  ) {}

  read() {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor);
      this.authorization.requirePermission(
        access,
        'official_results.policies.view',
      );
      const current = await this.authorization.currentPolicy(
        client,
        actor.schoolId,
      );
      return {
        policyVersionId: current.id,
        revision: current.revision,
        policy: current.policy,
        capabilities: {
          canManage: {
            allowed: access.permissions.has('official_results.policies.manage'),
          },
        },
      };
    });
  }

  versions(query: ResultListQuery) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor);
      this.authorization.requirePermission(
        access,
        'official_results.policies.view',
      );
      const { limit, after } = readResultCursor(
        query,
        actor.schoolId,
        'policy-versions',
      );
      if (after && !/^\d{1,10}$/u.test(after))
        throw new ValidationDomainException('Invalid revision cursor');
      const versions = await this.policies.listVersions(
        client,
        actor.schoolId,
        limit,
        after ? Number(after) : undefined,
      );
      return presentResultPage(
        versions.map((row) => ({
          policyVersionId: row.id,
          revision: row.revision,
          policy: parseResultPolicy(row.configuration),
          contentDigest: row.contentDigest,
          activatedAt: row.createdAt.toISOString(),
        })),
        limit,
        ({ revision }) => String(revision),
        actor.schoolId,
        'policy-versions',
      );
    });
  }

  preview(input: { expectedPolicyVersionId: string | null; policy: unknown }) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor, {
        write: true,
      });
      this.authorization.requirePermission(
        access,
        'official_results.policies.manage',
      );
      const current = await this.authorization.currentPolicy(
        client,
        actor.schoolId,
      );
      if (current.id !== input.expectedPolicyVersionId)
        throw new OfficialResultsError('policy.stale');
      const proposed = this.policies.withRuleIdentities(
        parseResultPolicy(input.policy),
        current.policy,
      );
      const impact = await this.policies.computeImpact(
        client,
        actor.schoolId,
        proposed,
        current.policy,
      );
      return this.policies.createPreview(
        client,
        actor,
        current.id,
        proposed,
        impact,
      );
    });
  }

  activate(
    input: {
      expectedPolicyVersionId: string | null;
      previewId: string;
      previewDigest: string;
    },
    key: string | undefined,
  ) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor, {
        write: true,
        policyChange: true,
      });
      this.authorization.requirePermission(
        access,
        'official_results.policies.manage',
      );
      return this.commands.idempotent(
        client,
        actor,
        'policy.activate',
        key,
        input,
        async () => {
          const current = await this.authorization.currentPolicy(
            client,
            actor.schoolId,
          );
          const preview = await this.policies.loadPreview(
            client,
            actor,
            input.previewId,
          );
          if (
            current.id !== input.expectedPolicyVersionId ||
            preview.expectedPolicyVersionId !== current.id ||
            preview.digest !== input.previewDigest
          )
            throw new OfficialResultsError('policy.stale');
          const policy = parseResultPolicy(preview.proposal);
          const impact = await this.policies.computeImpact(
            client,
            actor.schoolId,
            policy,
            current.policy,
          );
          if (
            resultContentDigest({ versionId: current.id, policy, impact }) !==
            input.previewDigest
          ) {
            throw new OfficialResultsError('policy.stale');
          }
          const version = await this.policies.activate(
            client,
            actor,
            current,
            policy,
          );
          await this.commands.audit(
            client,
            actor,
            'policy.activate',
            'result_policy_version',
            version.id,
            {
              previousPolicyVersionId: current.id,
              revision: version.revision,
              previewDigest: input.previewDigest,
              changedSettings: impact.changedSettings,
            },
          );
          return {
            policyVersionId: version.id,
            revision: version.revision,
            policy,
            capabilities: { canManage: { allowed: true } },
          };
        },
      );
    });
  }
}

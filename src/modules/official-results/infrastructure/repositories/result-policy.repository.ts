import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { ResultActor } from '../../application/result-actor';
import { OfficialResultsError } from '../../domain/official-results.error';
import { resultContentDigest } from '../../domain/result-content-digest';
import {
  effectiveResultPolicy,
  type ResultPolicy,
} from '../../domain/result-policy';
import { ResultScopeFactsRepository } from './result-scope-facts.repository';

@Injectable()
export class ResultPolicyRepository {
  constructor(private readonly scopeFacts: ResultScopeFactsRepository) {}

  withRuleIdentities(
    policy: ResultPolicy,
    previous: ResultPolicy,
  ): ResultPolicy {
    const existingIds = new Set(
      previous.scopedOverrides.map(({ ruleId }) => ruleId),
    );
    const seen = new Set<string>();
    const scopedOverrides = policy.scopedOverrides.map((rule) => {
      if (
        rule.ruleId &&
        (!existingIds.has(rule.ruleId) || seen.has(rule.ruleId))
      ) {
        throw new OfficialResultsError('policy.invalid', { field: 'ruleId' });
      }
      const ruleId = rule.ruleId ?? randomUUID();
      seen.add(ruleId);
      return { ...rule, ruleId };
    });
    return { ...policy, scopedOverrides };
  }

  async computeImpact(
    client: Prisma.TransactionClient,
    schoolId: string,
    next: ResultPolicy,
    previous: ResultPolicy,
  ) {
    const nextFacts = await this.scopeFacts.forSelectors(
      client,
      schoolId,
      next.scopedOverrides,
      true,
    );
    const sheets = await client.resultSheet.findMany({
      where: { schoolId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        sheetRevision: true,
        groupId: true,
        classroomId: true,
        reportingPeriodId: true,
      },
      take: 50_001,
    });
    if (sheets.length > 50_000)
      throw new OfficialResultsError('scope.limit_exceeded');
    // Every currently eligible target is preflighted. The live resolver will
    // also reject an ambiguous policy if the academic structure later changes.
    const targets =
      next.scopedOverrides.length || previous.scopedOverrides.length
        ? await this.scopeFacts.policyTargets(client, schoolId)
        : [];
    const previousFacts = await this.scopeFacts.forSelectors(
      client,
      schoolId,
      previous.scopedOverrides,
      false,
    );
    const touched = new Set<string>();
    let affectedScopes = 0;
    for (const target of targets) {
      const proposed = effectiveResultPolicy(next, target, nextFacts).settings;
      const prior = effectiveResultPolicy(
        previous,
        target,
        previousFacts,
      ).settings;
      if (resultContentDigest(proposed) === resultContentDigest(prior))
        continue;
      touched.add(
        `${target.period.id}:${target.academic.CLASSROOM}:${target.groupId}`,
      );
      affectedScopes++;
    }
    const globalChange =
      resultContentDigest({ ...next, scopedOverrides: [] }) !==
      resultContentDigest({ ...previous, scopedOverrides: [] });
    const affected = sheets.filter(
      (sheet) =>
        globalChange ||
        touched.has(
          `${sheet.reportingPeriodId}:${sheet.classroomId}:${sheet.groupId}`,
        ),
    );
    return {
      affectedSheets: affected.length,
      affectedScopes:
        globalChange && targets.length === 0 ? affected.length : affectedScopes,
      pendingCandidates: 0,
      activeImports: 0,
      requiresRevalidation: globalChange || touched.size > 0,
      changedSettings: Object.keys(next).filter(
        (key) =>
          resultContentDigest(next[key as keyof ResultPolicy]) !==
          resultContentDigest(previous[key as keyof ResultPolicy]),
      ),
      scopeFingerprint: resultContentDigest(
        affected.map(({ id, sheetRevision }) => ({ id, sheetRevision })),
      ),
    };
  }

  async createPreview(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    versionId: string | null,
    policy: ResultPolicy,
    impact: Awaited<ReturnType<ResultPolicyRepository['computeImpact']>>,
  ) {
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const digest = resultContentDigest({ versionId, policy, impact });
    const preview = await client.resultPolicyPreview.create({
      data: {
        schoolId: actor.schoolId,
        authorId: actor.actorId,
        expectedPolicyVersionId: versionId,
        proposal: policy,
        impact,
        digest,
        expiresAt,
      },
      select: { id: true },
    });
    return {
      previewId: preview.id,
      previewDigest: digest,
      expectedPolicyVersionId: versionId,
      expiresAt: expiresAt.toISOString(),
      impact,
      impacts: [
        {
          kind: 'POLICY_ACTIVATION' as const,
          resourceId: actor.schoolId,
          before: { policyVersionId: versionId },
          after: { affectedScopes: impact.affectedScopes },
        },
      ],
      blockers: [],
      policy,
    };
  }

  async loadPreview(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    id: string,
  ) {
    const preview = await client.resultPolicyPreview.findFirst({
      where: { id, schoolId: actor.schoolId, authorId: actor.actorId },
      select: {
        digest: true,
        expectedPolicyVersionId: true,
        expiresAt: true,
        proposal: true,
      },
    });
    if (!preview) throw new NotFoundDomainException();
    if (preview.expiresAt <= new Date())
      throw new OfficialResultsError('policy.stale');
    return preview;
  }

  async activate(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    current: { rootId?: string; revision: number },
    policy: ResultPolicy,
  ) {
    let rootId = current.rootId;
    if (!rootId) {
      const root = await client.officialResultPolicy.create({
        data: { schoolId: actor.schoolId },
        select: { id: true },
      });
      rootId = root.id;
    }
    const version = await client.officialResultPolicyVersion.create({
      data: {
        schoolId: actor.schoolId,
        policyId: rootId,
        revision: current.revision + 1,
        configuration: policy,
        contentDigest: resultContentDigest(policy),
        authorId: actor.actorId,
      },
      select: { revision: true, id: true },
    });
    await client.officialResultPolicy.update({
      where: { id_schoolId: { id: rootId, schoolId: actor.schoolId } },
      data: { activeVersionId: version.id },
      select: { id: true },
    });
    return version;
  }

  listVersions(
    client: Prisma.TransactionClient,
    schoolId: string,
    limit: number,
    before?: number,
  ) {
    return client.officialResultPolicyVersion.findMany({
      where: {
        schoolId,
        revision: before === undefined ? undefined : { lt: before },
      },
      orderBy: { revision: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        revision: true,
        configuration: true,
        contentDigest: true,
        createdAt: true,
      },
    });
  }
}

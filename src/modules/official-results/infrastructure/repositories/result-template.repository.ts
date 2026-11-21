import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  ResultTemplate,
  ResultTemplateVersion,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { ResultActor } from '../../application/result-actor';
import { OfficialResultsError } from '../../domain/official-results.error';
import { resultContentDigest } from '../../domain/result-content-digest';
import type { ResultDefinition } from '../../domain/result-definition';
import { resolveTemplateRule } from '../../domain/result-template-rules';
import { ResultScopeFactsRepository } from './result-scope-facts.repository';
import { ResultTemplateScopeRepository } from './result-template-scope.repository';
import {
  moazezStarterDefinition,
  starterTemplateCode,
  starterTemplateId,
  starterVersionId,
} from '../../domain/moazez-starter';

export function presentResultTemplate(row: ResultTemplate) {
  return {
    templateId: row.id,
    ownership: 'SCHOOL' as const,
    label: { ar: row.labelAr, en: row.labelEn },
    description: row.description,
    revision: row.revision,
    activeVersionId: row.activeVersionId,
    currentVersionId: row.activeVersionId ?? row.latestVersionId,
    latestVersionId: row.latestVersionId,
    archived: row.archivedAt !== null,
  };
}
export function presentStarterTemplate() {
  const definition = moazezStarterDefinition();
  return {
    templateId: starterTemplateId,
    ownership: 'PLATFORM' as const,
    label: definition.label,
    description: null,
    revision: 1,
    activeVersionId: starterVersionId,
    currentVersionId: starterVersionId,
    latestVersionId: starterVersionId,
    archived: false,
  };
}

export function presentResultTemplateVersion(row: ResultTemplateVersion) {
  return {
    templateId: row.templateId,
    templateVersionId: row.id,
    definitionVersionId: row.id,
    version: row.version,
    definition: row.definition,
    origin: row.origin,
    contentDigest: row.contentDigest,
    createdAt: row.createdAt.toISOString(),
  };
}
export function presentStarterVersion() {
  const definition = moazezStarterDefinition();
  return {
    templateId: starterTemplateId,
    templateVersionId: starterVersionId,
    definitionVersionId: starterVersionId,
    version: 1,
    definition,
    origin: {
      kind: 'PLATFORM',
      platformTemplateCode: starterTemplateCode,
      platformTemplateVersion: 1,
    },
    contentDigest: resultContentDigest(definition),
  };
}

@Injectable()
export class ResultTemplateRepository {
  constructor(
    private readonly scopeFacts: ResultScopeFactsRepository,
    private readonly scopes: ResultTemplateScopeRepository,
  ) {}
  async template(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    templateId: string,
  ) {
    const row = await client.resultTemplate.findFirst({
      where: { schoolId: actor.schoolId, id: templateId },
    });
    if (!row) throw new NotFoundDomainException();
    return row;
  }

  async version(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    templateId: string,
    id: string,
  ) {
    const row = await client.resultTemplateVersion.findFirst({
      where: { schoolId: actor.schoolId, templateId, id },
    });
    if (!row) throw new NotFoundDomainException();
    return row;
  }

  create(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    input: { label: ResultDefinition['label']; description?: string },
  ) {
    return client.resultTemplate.create({
      data: {
        schoolId: actor.schoolId,
        labelAr: input.label.ar,
        labelEn: input.label.en,
        description: input.description,
      },
    });
  }

  async append(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    template: ResultTemplate,
    definition: ResultDefinition,
    origin: Prisma.InputJsonObject,
  ) {
    if (template.archivedAt)
      throw new OfficialResultsError('template.archived');
    const head = template.latestVersionId
      ? await this.version(client, actor, template.id, template.latestVersionId)
      : null;
    const payload = await client.resultTemplateVersion.create({
      data: {
        schoolId: actor.schoolId,
        templateId: template.id,
        version: (head?.version ?? 0) + 1,
        definition,
        origin,
        contentDigest: resultContentDigest(definition),
        createdById: actor.actorId,
      },
    });
    await client.resultTemplate.update({
      where: { id_schoolId: { id: template.id, schoolId: actor.schoolId } },
      data: { latestVersionId: payload.id, revision: { increment: 1 } },
      select: { id: true },
    });
    return payload;
  }

  async activationImpact(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    template: ResultTemplate,
    version: ResultTemplateVersion,
  ) {
    const activeAssignments = await client.resultTemplateAssignment.findMany({
      where: {
        schoolId: actor.schoolId,
        enabled: true,
        templateVersion: { templateId: template.id },
      },
      select: { id: true, templateVersionId: true, scopeRevision: true },
      orderBy: { id: 'asc' },
    });
    const scope = activeAssignments.map(
      ({ id, templateVersionId, scopeRevision }) => ({
        id,
        templateVersionId,
        scopeRevision,
      }),
    );
    return {
      templateId: template.id,
      versionId: version.id,
      expectedTemplateRevision: template.revision,
      previousVersionId: template.activeVersionId,
      definitionDigest: version.contentDigest,
      affectedAssignments: scope.length,
      assignmentDigest: resultContentDigest(scope),
      altersExistingSheets: false,
    };
  }

  async setState(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    template: ResultTemplate,
    state: { activeVersionId: string } | { archivedAt: Date },
  ) {
    if (template.archivedAt)
      throw new OfficialResultsError('template.archived');
    return client.resultTemplate.update({
      where: { id_schoolId: { id: template.id, schoolId: actor.schoolId } },
      data: { ...state, revision: { increment: 1 } },
    });
  }

  async teacherVisibleVersions(
    client: Prisma.TransactionClient,
    actor: ResultActor,
  ) {
    const now = new Date();
    const [allocations, grants] = await Promise.all([
      client.teacherSubjectAllocation.findMany({
        where: { schoolId: actor.schoolId, teacherUserId: actor.actorId },
        select: { termId: true, subjectId: true, classroomId: true },
      }),
      client.officialResultScopeGrant.findMany({
        where: {
          schoolId: actor.schoolId,
          revokedAt: null,
          startsAt: { lte: now },
          fieldIds: { isEmpty: true },
          actions: { has: 'VIEW' },
          AND: [
            {
              OR: [
                { granteeUserId: actor.actorId },
                { granteeRoleId: actor.roleId },
              ],
            },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ],
        },
        select: {
          reportingPeriodIds: true,
          groupIds: true,
          classroomIds: true,
        },
      }),
    ]);
    if (!allocations.length && !grants.length) return [];
    const [potential, resolver] = await Promise.all([
      this.scopeFacts.policyTargets(client, actor.schoolId),
      this.scopes.resolvedRules(client, actor.schoolId),
    ]);
    const allocated = new Set(
      allocations.map((row) =>
        [row.termId, row.subjectId, row.classroomId].join(':'),
      ),
    );
    const ids = new Set<string>();
    for (const target of potential) {
      const [period, classroomId] = [target.period, target.academic.CLASSROOM];
      const exact =
        period.termId && target.subjectId
          ? allocated.has(
              [period.termId, target.subjectId, classroomId].join(':'),
            )
          : grants.some(
              (grant) =>
                grant.reportingPeriodIds.includes(period.id) &&
                grant.groupIds.includes(target.groupId) &&
                grant.classroomIds.includes(classroomId),
            );
      if (!exact) continue;
      const sheet = await client.resultSheet.findFirst({
        where: {
          schoolId: actor.schoolId,
          reportingPeriodId: period.id,
          classroomId,
          groupId: target.groupId,
        },
        select: { draftDefinition: { select: { configuration: true } } },
      });
      const config = sheet?.draftDefinition?.configuration;
      if (
        config &&
        typeof config === 'object' &&
        !Array.isArray(config) &&
        typeof config.templateVersionId === 'string'
      ) {
        ids.add(config.templateVersionId);
      }
      try {
        const matched = resolveTemplateRule(
          resolver.rules,
          target,
          resolver.facts,
        );
        if (matched) ids.add(matched.versionId);
      } catch (error) {
        if (
          !(error instanceof OfficialResultsError) ||
          error.code !== 'official_results.scope.conflict'
        )
          throw error;
      }
    }
    return [...ids];
  }

  async hasVisibleVersion(
    client: Prisma.TransactionClient,
    schoolId: string,
    templateId: string,
    allowed: string[],
  ) {
    return (
      (await client.resultTemplateVersion.count({
        where: { schoolId, templateId, id: { in: allowed } },
      })) > 0
    );
  }

  list(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    filters: {
      archived?: boolean;
      search?: string;
      groupKind?: 'CUSTOM' | 'SUBJECT';
    },
    limit: number,
    after: string | null,
    teacherVisible?: string[],
  ) {
    return client.resultTemplate.findMany({
      where: {
        schoolId: actor.schoolId,
        id: after ? { gt: after } : undefined,
        archivedAt:
          filters.archived === undefined
            ? undefined
            : filters.archived
              ? { not: null }
              : null,
        versions: teacherVisible
          ? { some: { id: { in: teacherVisible } } }
          : undefined,
        latestVersion: filters.groupKind
          ? {
              definition: { path: ['groupKind'], equals: filters.groupKind },
            }
          : undefined,
        OR: filters.search
          ? [
              { labelAr: { contains: filters.search, mode: 'insensitive' } },
              { labelEn: { contains: filters.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
  }
}

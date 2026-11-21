import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { ResultActor } from '../../application/result-actor';
import { OfficialResultsError } from '../../domain/official-results.error';
import type { ResultDefinition } from '../../domain/result-definition';
import {
  extendResultDefinition,
  resolveTemplateRule,
  templateScopeSelector,
  type TemplateRule,
} from '../../domain/result-template-rules';
import {
  type ConcreteResultsScope,
  type ResultSelector,
  type ResultScopeFacts,
} from '../../domain/result-scope';
import { ResultScopeFactsRepository } from './result-scope-facts.repository';

export interface TemplateAssignmentInput extends ResultSelector {
  id?: string;
  mode: 'REPLACE' | 'EXTEND';
  templateVersionId: string;
  baseTemplateVersionId?: string;
  enabled: boolean;
}

@Injectable()
export class ResultTemplateScopeRepository {
  async operationSheetTarget(
    client: Prisma.TransactionClient,
    schoolId: string,
    sheetId: string,
    slotId: string,
  ) {
    const row = await client.resultSheet.findFirst({
      where: {
        schoolId,
        id: sheetId,
        slots: { some: { schoolId, id: slotId } },
      },
      select: { classroomId: true, reportingPeriodId: true, groupId: true },
    });
    if (!row) throw new NotFoundDomainException();
    return row;
  }
  constructor(private readonly facts: ResultScopeFactsRepository) {}

  async activeRules(
    client: Prisma.TransactionClient,
    schoolId: string,
  ): Promise<TemplateRule[]> {
    const records = await client.resultTemplateAssignment.findMany({
      where: {
        schoolId,
        enabled: true,
        templateVersion: { template: { archivedAt: null } },
        OR: [
          { baseTemplateVersionId: null },
          { baseTemplateVersion: { template: { archivedAt: null } } },
        ],
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        mode: true,
        selector: true,
        enabled: true,
        templateVersionId: true,
        templateVersion: { select: { definition: true } },
        baseTemplateVersion: { select: { definition: true } },
      },
      take: 501,
    });
    if (records.length > 500)
      throw new OfficialResultsError('scope.limit_exceeded');
    return records.map((record) => {
      const definition = record.templateVersion
        .definition as unknown as ResultDefinition;
      return {
        ...templateScopeSelector.parse(record.selector),
        id: record.id,
        enabled: record.enabled,
        versionId: record.templateVersionId,
        definition: record.baseTemplateVersion
          ? extendResultDefinition(
              record.baseTemplateVersion
                .definition as unknown as ResultDefinition,
              definition,
            )
          : definition,
      };
    });
  }

  async assign(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    expectedScopeRevision: number,
    input: TemplateAssignmentInput,
  ) {
    const { schoolId } = actor;
    const revision = await client.resultScopeRevision.findFirst({
      where: { schoolId },
    });
    if ((revision?.revision ?? 0) !== expectedScopeRevision)
      throw new OfficialResultsError('revision.stale');
    if (
      (input.mode === 'EXTEND') !== Boolean(input.baseTemplateVersionId) ||
      input.templateVersionId === input.baseTemplateVersionId
    ) {
      throw new OfficialResultsError('schema.invalid', {
        path: 'baseTemplateVersionId',
      });
    }
    const findVersion = (id: string) =>
      client.resultTemplateVersion.findFirst({
        where: {
          id,
          schoolId,
          template: { archivedAt: null, activeVersionId: id },
        },
        select: { definition: true },
      });
    const version = await findVersion(input.templateVersionId);
    const base = input.baseTemplateVersionId
      ? await findVersion(input.baseTemplateVersionId)
      : null;
    if (!version || (input.baseTemplateVersionId && !base))
      throw new NotFoundDomainException();
    const definition = version.definition as unknown as ResultDefinition;
    if (
      (input.groupScope.kind === 'CUSTOM_GROUPS') !==
      (definition.groupKind === 'CUSTOM')
    ) {
      throw new OfficialResultsError('schema.invalid', { path: 'groupScope' });
    }

    const selector = {
      academicScope: input.academicScope,
      groupScope: input.groupScope,
      periodSelector: input.periodSelector,
    };
    const current = await this.activeRules(client, schoolId);
    const candidate: TemplateRule = {
      ...selector,
      id: input.id ?? '',
      versionId: input.templateVersionId,
      enabled: input.enabled,
      definition: base
        ? extendResultDefinition(
            base.definition as unknown as ResultDefinition,
            definition,
          )
        : definition,
    };
    const proposed = current
      .filter((rule) => rule.id !== input.id)
      .concat(candidate);
    const facts = await this.facts.forSelectors(
      client,
      schoolId,
      proposed,
      input.enabled,
    );
    if (input.enabled) {
      const targets = await this.facts.policyTargets(client, schoolId);
      for (const target of targets)
        resolveTemplateRule(proposed, target, facts);
    }

    const data = {
      selector,
      enabled: input.enabled,
      mode: input.mode,
      templateVersionId: input.templateVersionId,
      baseTemplateVersionId: input.baseTemplateVersionId ?? null,
      scopeRevision: expectedScopeRevision + 1,
    };
    let assignmentId: string;
    if (input.id) {
      const changed = await client.resultTemplateAssignment.updateMany({
        where: { id: input.id, schoolId },
        data,
      });
      if (changed.count !== 1) throw new NotFoundDomainException();
      assignmentId = input.id;
    } else {
      const row = await client.resultTemplateAssignment.create({
        data: { ...data, schoolId },
        select: { id: true },
      });
      assignmentId = row.id;
    }
    if (revision) {
      await client.resultScopeRevision.updateMany({
        where: { schoolId, id: revision.id, revision: expectedScopeRevision },
        data: { revision: { increment: 1 } },
      });
    } else {
      await client.resultScopeRevision.create({ data: { schoolId } });
    }
    return {
      assignmentId,
      revision: data.scopeRevision,
      scopeRevision: data.scopeRevision,
      assignment: {
        ...selector,
        mode: data.mode,
        enabled: data.enabled,
        templateVersionId: data.templateVersionId,
        baseTemplateVersionId: data.baseTemplateVersionId,
      },
    };
  }

  async resolvedRules(
    client: Prisma.TransactionClient,
    schoolId: string,
  ): Promise<{
    rules: TemplateRule[];
    facts: ResultScopeFacts;
  }> {
    const rules = await this.activeRules(client, schoolId);
    return {
      rules,
      facts: await this.facts.forSelectors(client, schoolId, rules, false),
    };
  }

  list(
    client: Prisma.TransactionClient,
    schoolId: string,
    limit: number,
    after: string | null,
  ) {
    return client.resultTemplateAssignment.findMany({
      where: { schoolId, id: after ? { gt: after } : undefined },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
  }

  existingSheet(
    client: Prisma.TransactionClient,
    schoolId: string,
    target: {
      reportingPeriodId: string;
      classroomId: string;
      groupId: string;
    },
  ) {
    return client.resultSheet.findFirst({
      where: { schoolId, ...target },
      select: { id: true, draftDefinitionVersionId: true },
    });
  }

  private async actualClassrooms(
    client: Prisma.TransactionClient,
    schoolId: string,
  ) {
    return client.classroom.findMany({
      where: {
        schoolId,
        deletedAt: null,
        section: {
          deletedAt: null,
          grade: { deletedAt: null, stage: { deletedAt: null } },
        },
      },
      select: {
        id: true,
        sectionId: true,
        section: {
          select: { gradeId: true, grade: { select: { stageId: true } } },
        },
      },
      take: 50_001,
    });
  }

  async targets(
    client: Prisma.TransactionClient,
    schoolId: string,
    reportingPeriodId: string,
    academicScope: ResultSelector['academicScope'],
    groupIds: string[],
  ): Promise<ConcreteResultsScope[]> {
    const period = await client.resultReportingPeriod.findFirst({
      where: {
        schoolId,
        id: reportingPeriodId,
        academicYear: { deletedAt: null },
      },
      select: { id: true, kind: true, academicYearId: true, termId: true },
    });
    const groups = await client.resultGroup.findMany({
      where: { schoolId, id: { in: groupIds }, archivedAt: null },
      select: { id: true, subjectId: true },
    });
    if (!period || groups.length !== groupIds.length)
      throw new NotFoundDomainException();
    await this.facts.forSelectors(
      client,
      schoolId,
      [
        {
          academicScope,
          periodSelector: { kind: 'EXACT_PERIODS', periodIds: [period.id] },
          groupScope: { kind: 'ALL_SUBJECTS' },
        },
      ],
      true,
    );

    const classrooms = await this.actualClassrooms(client, schoolId);
    if (classrooms.length > 50_000)
      throw new OfficialResultsError('scope.limit_exceeded');
    const paths = classrooms
      .map((row) => ({
        CLASSROOM: row.id,
        SECTION: row.sectionId,
        GRADE: row.section.gradeId,
        STAGE: row.section.grade.stageId,
      }))
      .filter(
        (path) =>
          academicScope.level === 'SCHOOL' ||
          academicScope.ids.includes(path[academicScope.level]),
      );
    const terms = await client.subjectAllocation.findMany({
      where: {
        schoolId,
        deletedAt: null,
        academicYearId: period.academicYearId,
        termId: period.termId ?? undefined,
        gradeId: { in: [...new Set(paths.map((path) => path.GRADE))] },
        subjectId: {
          in: groups.flatMap((group) =>
            group.subjectId ? [group.subjectId] : [],
          ),
        },
      },
      select: { subjectId: true, gradeId: true },
    });
    const subjects = new Set(
      terms.map((row) => `${row.gradeId}:${row.subjectId}`),
    );
    const result: ConcreteResultsScope[] = [];
    for (const academic of paths) {
      for (const group of groups) {
        if (
          group.subjectId &&
          !subjects.has(`${academic.GRADE}:${group.subjectId}`)
        )
          continue;
        if (result.length >= 5000)
          throw new OfficialResultsError('scope.limit_exceeded');
        result.push({
          academic,
          groupId: group.id,
          subjectId: group.subjectId,
          period,
        });
      }
    }
    return result.sort(
      (first, second) =>
        first.academic.CLASSROOM.localeCompare(second.academic.CLASSROOM) ||
        first.groupId.localeCompare(second.groupId),
    );
  }
}

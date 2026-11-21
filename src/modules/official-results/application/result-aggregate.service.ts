import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { OfficialResultsError } from '../domain/official-results.error';
import {
  type AggregateDefinition,
  type AggregateInput,
  type AggregateValue,
  resultAggregateDefinition,
} from '../domain/result-aggregate.contract';
import { resultContentDigest } from '../domain/result-content-digest';
import { ResultFraction } from '../domain/result-fraction';
import {
  releaseSnapshot,
  type ReleaseInput,
} from '../domain/result-release.contract';
import { ResultAggregateRepository } from '../infrastructure/repositories/result-aggregate.repository';
import {
  ResultAuthorizationRepository,
  type ResultPermissionCheck,
} from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import { ResultReleaseRepository } from '../infrastructure/repositories/result-release.repository';
import { requireResultActor } from './result-actor';

type Tx = Prisma.TransactionClient;
type Draft = Awaited<ReturnType<ResultAggregateRepository['candidate']>>;
const unitKey = (target: { groupId: string; releaseUnitId: string }) =>
  target.groupId + ':' + target.releaseUnitId;
const one = new ResultFraction(1n);
const zero = new ResultFraction(0n);
const hundred = new ResultFraction(100n);
const sum = (values: ResultFraction[]) =>
  values.reduce((total, value) => total.add(value), zero);

@Injectable()
export class ResultAggregateService {
  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly auth: ResultAuthorizationRepository,
    private readonly aggregates: ResultAggregateRepository,
    private readonly release: ResultReleaseRepository,
  ) {}

  profile(input: AggregateInput<'profile'>, key?: string) {
    return this.command(
      'aggregate.profile',
      input,
      key,
      async (client, access) => {
        const { actor } = access;
        const { definition, expectedProfileRevision } = input;
        this.validateProfile(definition);
        const groupIds = [
          ...new Set(definition.inputs.map((target) => target.groupId)),
        ];
        if (
          (await client.resultGroup.count({
            where: {
              schoolId: actor.schoolId,
              id: { in: groupIds },
              archivedAt: null,
            },
          })) !== groupIds.length
        ) {
          throw new NotFoundDomainException();
        }
        const selector = definition.reportingPeriodSelector;
        if (
          selector.kind === 'EXACT_PERIODS' &&
          (await client.resultReportingPeriod.count({
            where: { schoolId: actor.schoolId, id: { in: selector.periodIds } },
          })) !== selector.periodIds.length
        )
          throw new NotFoundDomainException();
        if (
          selector.kind === 'ACADEMIC_YEAR' &&
          !(await client.academicYear.count({
            where: {
              schoolId: actor.schoolId,
              id: selector.academicYearId,
              deletedAt: null,
            },
          }))
        )
          throw new NotFoundDomainException();
        let profileId: string;
        if (input.profileId) {
          profileId = input.profileId;
          const changed = await client.resultAggregateProfile.updateMany({
            where: {
              id: profileId,
              schoolId: actor.schoolId,
              revision: expectedProfileRevision,
              code: definition.code,
            },
            data: { revision: { increment: 1 } },
          });
          if (changed.count !== 1)
            throw new OfficialResultsError('revision.stale');
        } else {
          if (
            await client.resultAggregateProfile.count({
              where: { schoolId: actor.schoolId, code: definition.code },
            })
          ) {
            throw new OfficialResultsError('revision.stale');
          }
          profileId = (
            await client.resultAggregateProfile.create({
              data: {
                schoolId: actor.schoolId,
                code: definition.code,
                revision: 1,
              },
              select: { id: true },
            })
          ).id;
        }
        const version = await client.resultAggregateProfileVersion.create({
          data: {
            schoolId: actor.schoolId,
            profileId,
            revision: expectedProfileRevision + 1,
            definition,
          },
        });
        await this.commands.audit(
          client,
          actor,
          'aggregate.profile',
          'result_aggregate_profile',
          profileId,
          { revision: version.revision },
        );
        return {
          profileId,
          profileVersionId: version.id,
          revision: version.revision,
          definition,
        };
      },
      true,
    );
  }

  capture(input: AggregateInput<'candidate'>, key?: string) {
    return this.command(
      'aggregate.capture',
      input,
      key,
      async (client, access) => {
        const { actor } = access;
        const version = await client.resultAggregateProfileVersion.findFirst({
          where: { schoolId: actor.schoolId, id: input.profileVersionId },
          include: { profile: true },
        });
        if (!version || version.profile.revision !== version.revision)
          throw new OfficialResultsError('candidate.stale');
        const definition = resultAggregateDefinition.parse(version.definition);
        const observed = await this.sources(
          client,
          access,
          input,
          definition,
          'SUBMIT',
        );
        const evidence = {
          studentId: input.studentId,
          reportingPeriodId: input.reportingPeriodId,
          profileId: version.profileId,
          profileVersionId: version.id,
          sourcePublicationIds: input.sourcePublicationIds,
          policyVersionId: observed.policyVersionId,
          computedResult: observed.computedResult,
        };
        const candidate = await client.resultAggregateCandidate.create({
          data: {
            ...evidence,
            schoolId: actor.schoolId,
            submittedById: actor.actorId,
            status: 'SUBMITTED',
            contentDigest: resultContentDigest(evidence),
          },
        });
        await client.resultAggregateDependency.createMany({
          data: input.sourcePublicationIds.map((publicationId) => ({
            schoolId: actor.schoolId,
            candidateId: candidate.id,
            publicationId,
          })),
        });
        await this.commands.audit(
          client,
          actor,
          'aggregate.capture',
          'result_aggregate_candidate',
          candidate.id,
          { count: input.sourcePublicationIds.length },
        );
        return this.presentCandidate(candidate);
      },
    );
  }

  list(
    client: Tx,
    access: ResultPermissionCheck,
    query: {
      reportingPeriodId?: string;
      submitterId?: string;
      candidateStatus?: Draft['status'];
    },
    after: string | null,
    limit: number,
  ) {
    return client.resultAggregateCandidate.findMany({
      where: {
        schoolId: access.actor.schoolId,
        id: after ? { gt: after } : undefined,
        reportingPeriodId: query.reportingPeriodId,
        submittedById: query.submitterId,
        status: query.candidateStatus,
      },
      orderBy: { id: 'asc' },
      take: limit,
    });
  }

  presentCandidate(candidate: Omit<Draft, 'profileVersion' | 'decision'>) {
    return {
      candidateKind: 'AGGREGATE' as const,
      candidateId: candidate.id,
      candidateRevision: candidate.revision,
      status: candidate.status,
      contentDigest: candidate.contentDigest,
      sourcePublicationIds: candidate.sourcePublicationIds,
      profileVersionId: candidate.profileVersionId,
      reportingPeriodId: candidate.reportingPeriodId,
      studentId: candidate.studentId,
      computedResult: candidate.computedResult,
    };
  }

  async decide(
    client: Tx,
    access: ResultPermissionCheck,
    input: ReleaseInput<'decide'>,
  ) {
    const { actor } = access;
    const candidate = await this.aggregates.currentCandidate(
      client,
      actor.schoolId,
      input.candidateId,
      input.expectedCandidateRevision,
      input.contentDigest,
    );
    const current = await this.sources(
      client,
      access,
      candidate,
      resultAggregateDefinition.parse(candidate.profileVersion.definition),
      'VIEW',
    );
    if (
      current.policyVersionId !== candidate.policyVersionId ||
      candidate.status !== 'SUBMITTED'
    ) {
      throw new OfficialResultsError('candidate.stale');
    }
    if (
      current.requireDistinctApprover &&
      candidate.submittedById === actor.actorId
    )
      throw new OfficialResultsError('publication.forbidden');
    const changed = await client.resultAggregateCandidate.updateMany({
      where: {
        id: candidate.id,
        schoolId: actor.schoolId,
        revision: candidate.revision,
        status: 'SUBMITTED',
      },
      data: {
        status: input.decision === 'APPROVE' ? 'APPROVED' : 'RETURNED',
        revision: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw new OfficialResultsError('candidate.stale');
    const decision = await client.resultAggregateDecision.create({
      data: {
        schoolId: actor.schoolId,
        candidateId: candidate.id,
        contentDigest: input.contentDigest,
        candidateRevision: candidate.revision,
        reviewerId: actor.actorId,
        decision: input.decision,
        comment: input.comment,
      },
    });
    await this.commands.audit(
      client,
      actor,
      'aggregate.decide',
      'result_aggregate_decision',
      decision.id,
      {
        candidateId: candidate.id,
        contentDigest: decision.contentDigest,
        decision: decision.decision,
      },
    );
    return {
      decisionId: decision.id,
      candidateId: candidate.id,
      candidateKind: 'AGGREGATE' as const,
      decision: decision.decision,
      contentDigest: decision.contentDigest,
      reviewerId: decision.reviewerId,
      decidedAt: decision.decidedAt.toISOString(),
      ...(decision.comment ? { comment: decision.comment } : {}),
    };
  }

  publish(input: AggregateInput<'publish'>, key?: string) {
    return this.command(
      'aggregate.publish',
      input,
      key,
      async (client, access) => {
        this.auth.requirePermission(
          access,
          'official_results.publications.publish',
        );
        const { actor } = access;
        const candidate = await this.aggregates.currentCandidate(
          client,
          actor.schoolId,
          input.candidateId,
          input.expectedCandidateRevision,
          input.contentDigest,
        );
        const current = await this.sources(
          client,
          access,
          candidate,
          resultAggregateDefinition.parse(candidate.profileVersion.definition),
          'PUBLISH',
        );
        if (current.policyVersionId !== candidate.policyVersionId)
          throw new OfficialResultsError('candidate.stale');
        if (
          current.computedResult.completeness !== 'COMPLETE' &&
          !current.partialPublication
        )
          throw new OfficialResultsError('publication.incomplete');
        const approved =
          candidate.status === 'APPROVED' &&
          candidate.decision?.decision === 'APPROVE' &&
          candidate.decision.contentDigest === candidate.contentDigest &&
          candidate.decision.candidateRevision + 1 === candidate.revision;
        if (
          !approved &&
          (!current.directPublication || candidate.status !== 'SUBMITTED')
        )
          throw new OfficialResultsError('review.required');
        const target = {
          schoolId: candidate.schoolId,
          studentId: candidate.studentId,
          reportingPeriodId: candidate.reportingPeriodId,
          profileId: candidate.profileId,
        };
        const head = await client.resultCurrentAggregate.findFirst({
          where: target,
          include: { publication: { select: { revision: true } } },
        });
        if (
          (head?.publicationId ?? null) !==
          input.expectedCurrentAggregatePublicationId
        )
          throw new OfficialResultsError('publication.stale');
        const publication = await client.resultAggregatePublication.create({
          data: {
            ...target,
            candidateId: candidate.id,
            revision: (head?.publication.revision ?? 0) + 1,
          },
        });
        if (head) {
          const updated = await client.resultCurrentAggregate.updateMany({
            where: {
              id: head.id,
              schoolId: actor.schoolId,
              publicationId: head.publicationId,
            },
            data: { publicationId: publication.id, stale: false },
          });
          if (updated.count !== 1)
            throw new OfficialResultsError('publication.stale');
        } else
          await client.resultCurrentAggregate.create({
            data: { ...target, publicationId: publication.id },
          });
        await this.commands.audit(
          client,
          actor,
          'aggregate.publish',
          'result_aggregate_publication',
          publication.id,
          {
            candidateId: candidate.id,
            authorizationMode: approved ? 'APPROVED' : 'DIRECT',
          },
        );
        return {
          publicationId: publication.id,
          revision: publication.revision,
          status: 'ACTIVE' as const,
          sourcePublicationIds: candidate.sourcePublicationIds,
          profileVersionId: candidate.profileVersionId,
          computedResult: candidate.computedResult,
          publishedAt: publication.publishedAt.toISOString(),
        };
      },
    );
  }

  private validateProfile(definition: AggregateDefinition) {
    const inputs = definition.inputs.map(unitKey);
    const coverage = definition.requiredCoverage.map(unitKey);
    const isWeighted = definition.operation === 'WEIGHTED_PERCENTAGE';
    const weights = definition.inputs.map((input) =>
      input.weight ? ResultFraction.decimal(input.weight) : zero,
    );
    if (
      new Set(inputs).size !== inputs.length ||
      new Set(coverage).size !== coverage.length ||
      coverage.some((id) => !inputs.includes(id)) ||
      (isWeighted
        ? weights.some((weight) => weight.compare(zero) <= 0n) ||
          sum(weights).compare(hundred) !== 0n
        : definition.inputs.some((item) => item.weight !== undefined))
    ) {
      throw new OfficialResultsError('schema.invalid');
    }
  }

  private async sources(
    client: Tx,
    access: ResultPermissionCheck,
    input: Pick<
      AggregateInput<'candidate'>,
      'studentId' | 'reportingPeriodId' | 'sourcePublicationIds'
    >,
    definition: AggregateDefinition,
    action: 'SUBMIT' | 'VIEW' | 'PUBLISH',
  ) {
    const { actor } = access;
    const period = await client.resultReportingPeriod.findFirst({
      where: { schoolId: actor.schoolId, id: input.reportingPeriodId },
    });
    if (!period) throw new NotFoundDomainException();
    const selector = definition.reportingPeriodSelector;
    if (
      selector.kind === 'EXACT_PERIODS'
        ? !selector.periodIds.includes(period.id)
        : !selector.periodKinds.includes(period.kind) ||
          (selector.kind === 'ACADEMIC_YEAR' &&
            period.academicYearId !== selector.academicYearId)
    ) {
      throw new OfficialResultsError('schema.invalid');
    }
    await this.aggregates.lockStudent(client, actor.schoolId, input.studentId);
    await this.aggregates.lockSources(
      client,
      actor.schoolId,
      input.sourcePublicationIds,
    );
    const sourceItems = await Promise.all(
      input.sourcePublicationIds.map((id) =>
        this.release.publication(client, actor.schoolId, id),
      ),
    );
    const coverage = new Map(
      definition.inputs.map((item) => [unitKey(item), item]),
    );
    const exemptions = new Set(
      (
        await client.resultSlot.findMany({
          where: {
            schoolId: actor.schoolId,
            studentId: input.studentId,
            reportingPeriodId: period.id,
            groupExempt: true,
          },
          select: { groupId: true },
        })
      ).map((item) => item.groupId),
    );
    const seen = new Set<string>();
    const weighted = definition.operation === 'WEIGHTED_PERCENTAGE';
    const sumPoints = definition.operation === 'SUM_POINTS';
    const chunks: {
      points: ResultFraction;
      maximum: ResultFraction;
      weight: ResultFraction;
    }[] = [];
    let requireDistinctApprover = false;
    let partialPublication = period.classification === 'PROGRESS';
    let directPublication = true;
    let policyVersionId: string | null = null;
    for (const publication of sourceItems) {
      const { slot } = publication.candidate;
      if (
        !publication.activePointer ||
        slot.studentId !== input.studentId ||
        slot.reportingPeriodId !== period.id ||
        slot.rosterState === 'RECONCILIATION_REQUIRED' ||
        slot.groupExempt
      )
        throw new OfficialResultsError('candidate.stale');
      const context = await this.auth.authorizedTarget(
        client,
        access,
        slot.sheet,
        action,
        { write: true, review: action !== 'SUBMIT' },
      );
      if (action === 'PUBLISH' && context.settings.publicationSuspended)
        throw new OfficialResultsError('publication.forbidden');
      policyVersionId = context.policyVersionId;
      requireDistinctApprover ||= context.settings.requireDistinctApprover;
      partialPublication &&= context.settings.allowPartialProgressPublication;
      directPublication &&=
        context.settings.firstPublication === 'DIRECT_IF_AUTHORIZED';
      const identity = unitKey({
        groupId: slot.groupId,
        releaseUnitId: publication.releaseUnitId,
      });
      const expected = coverage.get(identity);
      if (!expected || seen.has(identity))
        throw new OfficialResultsError('schema.invalid');
      seen.add(identity);
      const snapshot = releaseSnapshot.parse(publication.candidate.snapshot);
      const field = snapshot.fields.find(
        (entry) =>
          entry.definition.id === expected.fieldId &&
          snapshot.unit.outputFieldIds.includes(entry.definition.id),
      );
      if (
        !field ||
        definition.audiences.some(
          (audience) => !field.definition.audiences.includes(audience),
        )
      ) {
        throw new OfficialResultsError('schema.protected');
      }
      if (field.value.status !== 'RECORDED') continue;
      const rules = field.definition.constraints;
      const maximum =
        'maxScore' in rules
          ? rules.maxScore
          : field.calculation?.evaluation?.effectiveMaxScore;
      const weight = weighted ? ResultFraction.decimal(expected.weight!) : one;
      if ('score' in field.value && maximum) {
        chunks.push({
          points: ResultFraction.decimal(field.value.score),
          maximum: ResultFraction.decimal(maximum),
          weight,
        });
      } else if ('percentage' in field.value && !sumPoints) {
        chunks.push({
          points: ResultFraction.decimal(field.value.percentage),
          maximum: hundred,
          weight,
        });
      } else throw new OfficialResultsError('calculation.invalid');
    }
    let computedResult: AggregateValue = {
      overallScore: null,
      overallMaxScore: null,
      completeness: 'INCOMPLETE',
    };
    const complete =
      definition.requiredCoverage.every(
        (need) => exemptions.has(need.groupId) || seen.has(unitKey(need)),
      ) &&
      chunks.length === sourceItems.length &&
      chunks.length > 0;
    if (chunks.length && (complete || partialPublication)) {
      const modes = definition.calculationPolicy.displayRounding;
      const maximum = sumPoints
        ? sum(chunks.map((chunk) => chunk.maximum))
        : hundred;
      const score = sumPoints
        ? sum(chunks.map((chunk) => chunk.points))
        : sum(
            chunks.map((chunk) =>
              chunk.points.over(chunk.maximum).times(chunk.weight),
            ),
          )
            .over(sum(chunks.map((chunk) => chunk.weight)))
            .times(hundred);
      computedResult = {
        overallScore: score.format(modes.scale, modes.mode),
        overallMaxScore: maximum.format(modes.scale, modes.mode),
        completeness: complete ? 'COMPLETE' : 'PARTIAL',
      };
    }
    return {
      computedResult,
      policyVersionId,
      requireDistinctApprover,
      partialPublication,
      directPublication,
    };
  }

  private command<T extends Prisma.InputJsonObject>(
    op: string,
    input: unknown,
    key: string | undefined,
    write: (client: Tx, access: ResultPermissionCheck) => Promise<T>,
    policyChange = false,
  ) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor, {
        write: true,
        policyChange,
      });
      this.auth.requirePermission(access, 'official_results.aggregates.manage');
      return this.commands.idempotent(client, actor, op, key, input, () =>
        write(client, access),
      );
    });
  }
}

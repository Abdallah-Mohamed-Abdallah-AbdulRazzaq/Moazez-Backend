import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type ResultReleaseAuthorization,
  type ResultReleaseCandidateStatus,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { ResultActor } from '../../application/result-actor';
import { ResultAggregateRepository } from './result-aggregate.repository';
import { ResultFamilyRepository } from './result-family.repository';
import { OfficialResultsError } from '../../domain/official-results.error';
import {
  releaseSnapshot,
  type ReleaseSnapshot,
} from '../../domain/result-release.contract';

const includeCandidate = {
  state: true,
  decision: true,
  correction: true,
  slot: {
    include: {
      sheet: {
        select: {
          id: true,
          classroomId: true,
          groupId: true,
          reportingPeriodId: true,
        },
      },
    },
  },
} satisfies Prisma.ResultReleaseCandidateInclude;
const includePublication = {
  candidate: { include: includeCandidate },
  activePointer: true,
  events: true,
} satisfies Prisma.ResultPublicationInclude;

@Injectable()
export class ResultReleaseRepository {
  constructor(
    private readonly aggregates: ResultAggregateRepository,
    private readonly families: ResultFamilyRepository,
  ) {}

  invalidateSheet(
    client: Prisma.TransactionClient,
    schoolId: string,
    sheetIds: string[],
  ) {
    return client.resultReleaseCandidateState.updateMany({
      where: {
        schoolId,
        status: { in: ['SUBMITTED', 'APPROVED', 'READY_FOR_DIRECT'] },
        candidate: { sheetId: { in: sheetIds }, publication: null },
      },
      data: { status: 'SUPERSEDED', revision: { increment: 1 } },
    });
  }

  async invalidateValues(
    client: Prisma.TransactionClient,
    schoolId: string,
    changes: { slotId: string; fieldId: string }[],
  ) {
    const slots = [...new Set(changes.map((change) => change.slotId))];
    const changed = new Set(
      changes.map((change) => change.slotId + ':' + change.fieldId),
    );
    const candidates = await client.resultReleaseCandidate.findMany({
      where: {
        schoolId,
        slotId: { in: slots },
        publication: null,
        state: {
          status: { in: ['SUBMITTED', 'APPROVED', 'READY_FOR_DIRECT'] },
        },
      },
      select: { id: true, slotId: true, snapshot: true },
    });
    const superseded = candidates
      .filter((candidate) =>
        releaseSnapshot
          .parse(candidate.snapshot)
          .fields.some((field) =>
            changed.has(candidate.slotId + ':' + field.definition.id),
          ),
      )
      .map((candidate) => candidate.id);
    if (superseded.length)
      await client.resultReleaseCandidateState.updateMany({
        where: { schoolId, candidateId: { in: superseded } },
        data: { status: 'SUPERSEDED', revision: { increment: 1 } },
      });
  }
  async slot(
    client: Prisma.TransactionClient,
    schoolId: string,
    id: string,
    lock = false,
  ) {
    if (lock)
      await client.$queryRaw`
      SELECT id FROM result_slots WHERE school_id = ${schoolId}::uuid AND id = ${id}::uuid FOR UPDATE
    `;
    const slot = await client.resultSlot.findFirst({
      where: { schoolId, id },
      include: {
        sheet: {
          select: {
            id: true,
            classroomId: true,
            groupId: true,
            reportingPeriodId: true,
          },
        },
      },
    });
    if (!slot) throw new NotFoundDomainException();
    return slot;
  }

  async candidate(
    client: Prisma.TransactionClient,
    schoolId: string,
    id: string,
  ) {
    const candidate = await client.resultReleaseCandidate.findFirst({
      where: { schoolId, id },
      include: includeCandidate,
    });
    if (!candidate?.state) throw new NotFoundDomainException();
    return { ...candidate, state: candidate.state };
  }

  candidates(
    client: Prisma.TransactionClient,
    schoolId: string,
    after: string | null,
    limit: number,
    filters: {
      reportingPeriodId?: string;
      sheetId?: string;
      submitterId?: string;
      candidateStatus?: ResultReleaseCandidateStatus;
    },
  ) {
    return client.resultReleaseCandidate.findMany({
      where: {
        schoolId,
        id: after ? { gt: after } : undefined,
        sheetId: filters.sheetId,
        submittedById: filters.submitterId,
        slot: { reportingPeriodId: filters.reportingPeriodId },
        state: filters.candidateStatus
          ? { status: filters.candidateStatus }
          : undefined,
      },
      include: includeCandidate,
      orderBy: { id: 'asc' },
      take: limit,
    });
  }

  async freeze(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    payload: {
      sheetId: string;
      slotId: string;
      definitionVersionId: string;
      releaseUnitId: string;
      policyVersionId: string | null;
      correctionDraftId: string | null;
      capturedSlotRevision: number;
      intent: 'REVIEW' | 'DIRECT_PUBLICATION';
      snapshot: ReleaseSnapshot;
      contentDigest: string;
      sourceFingerprint: string;
    },
  ) {
    await client.resultReleaseCandidateState.updateMany({
      where: {
        schoolId: actor.schoolId,
        status: { in: ['SUBMITTED', 'APPROVED', 'READY_FOR_DIRECT'] },
        candidate: {
          slotId: payload.slotId,
          releaseUnitId: payload.releaseUnitId,
          publication: null,
        },
      },
      data: { status: 'SUPERSEDED', revision: { increment: 1 } },
    });
    const candidate = await client.resultReleaseCandidate.create({
      data: {
        ...payload,
        schoolId: actor.schoolId,
        submittedById: actor.actorId,
      },
      select: { id: true },
    });
    await client.resultReleaseCandidateState.create({
      data: {
        schoolId: actor.schoolId,
        candidateId: candidate.id,
        status: payload.intent === 'REVIEW' ? 'SUBMITTED' : 'READY_FOR_DIRECT',
      },
    });
    return this.candidate(client, actor.schoolId, candidate.id);
  }

  async decision(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    candidate: ReleaseCandidate,
    choice: 'APPROVE' | 'RETURN',
    policyVersionId: string | null,
    comment?: string,
  ) {
    const updated = await client.resultReleaseCandidateState.updateMany({
      where: {
        schoolId: actor.schoolId,
        candidateId: candidate.id,
        revision: candidate.state.revision,
        status: 'SUBMITTED',
      },
      data: {
        revision: { increment: 1 },
        status: choice === 'APPROVE' ? 'APPROVED' : 'RETURNED',
      },
    });
    if (updated.count !== 1) throw new OfficialResultsError('candidate.stale');
    return client.resultReviewDecision.create({
      data: {
        schoolId: actor.schoolId,
        candidateId: candidate.id,
        contentDigest: candidate.contentDigest,
        candidateRevision: candidate.state.revision,
        reviewerId: actor.actorId,
        policyVersionId,
        decision: choice,
        comment,
      },
    });
  }

  async publication(
    client: Prisma.TransactionClient,
    schoolId: string,
    id: string,
  ) {
    const publication = await client.resultPublication.findFirst({
      where: { schoolId, id },
      include: includePublication,
    });
    if (!publication) throw new NotFoundDomainException();
    return publication;
  }

  current(client: Prisma.TransactionClient, schoolId: string, slotId: string) {
    return client.resultCurrentRelease.findMany({
      where: { schoolId, slotId },
      include: { publication: { include: includePublication } },
      orderBy: { releaseUnitId: 'asc' },
    });
  }

  correction(
    client: Prisma.TransactionClient,
    schoolId: string,
    slotId: string,
    previousPublicationId: string,
  ) {
    return client.resultCorrectionDraft.findFirst({
      where: { schoolId, slotId, previousPublicationId },
    });
  }

  async openCorrection(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    prior: Publication,
    reason: string,
  ) {
    const previous = await this.correction(
      client,
      actor.schoolId,
      prior.slotId,
      prior.id,
    );
    if (previous) return previous;
    return client.resultCorrectionDraft.create({
      data: {
        schoolId: actor.schoolId,
        slotId: prior.slotId,
        previousPublicationId: prior.id,
        openedById: actor.actorId,
        reason,
      },
    });
  }

  async bump(
    client: Prisma.TransactionClient,
    schoolId: string,
    slotId: string,
    current: number,
  ) {
    const result = await client.resultSlot.updateMany({
      where: { id: slotId, schoolId, publicationGeneration: current },
      data: { publicationGeneration: { increment: 1 } },
    });
    if (result.count !== 1) throw new OfficialResultsError('publication.stale');
    return current + 1;
  }

  async issue(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    candidate: ReleaseCandidate,
    options: {
      generation: number;
      predecessorId: string | null;
      decisionId: string | null;
      authMode: ResultReleaseAuthorization;
      notify: boolean;
      policyVersionId: string | null;
    },
  ) {
    const prior = await client.resultPublication.findFirst({
      where: {
        schoolId: actor.schoolId,
        slotId: candidate.slotId,
        releaseUnitId: candidate.releaseUnitId,
      },
      select: { revision: true },
      orderBy: { revision: 'desc' },
    });
    const publication = await client.resultPublication.create({
      data: {
        schoolId: actor.schoolId,
        candidateId: candidate.id,
        slotId: candidate.slotId,
        releaseUnitId: candidate.releaseUnitId,
        definitionVersionId: candidate.definitionVersionId,
        policyVersionId: options.policyVersionId,
        predecessorId: options.predecessorId,
        reviewDecisionId: options.decisionId,
        publishedById: actor.actorId,
        revision: (prior?.revision ?? 0) + 1,
        publicationGeneration: options.generation,
        authorizationMode: options.authMode,
      },
    });
    await client.resultCurrentRelease.create({
      data: {
        schoolId: actor.schoolId,
        slotId: candidate.slotId,
        publicationId: publication.id,
        releaseUnitId: candidate.releaseUnitId,
      },
    });
    await this.event(
      client,
      actor,
      publication,
      'PUBLISHED',
      options.generation,
    );
    await this.families.issueReadEntitlements(
      client,
      actor.schoolId,
      publication.id,
    );
    if (options.notify)
      await client.resultPublicationNotice.create({
        data: {
          schoolId: actor.schoolId,
          publicationId: publication.id,
        },
      });
    return publication;
  }

  async remove(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    publication: Publication,
    event: 'SUPERSEDED' | 'REVOKED',
    generation: number,
    reason?: string,
  ) {
    const deleted = await client.resultCurrentRelease.deleteMany({
      where: {
        schoolId: actor.schoolId,
        slotId: publication.slotId,
        publicationId: publication.id,
      },
    });
    if (deleted.count !== 1)
      throw new OfficialResultsError('publication.stale');
    await this.aggregates.staleSources(client, actor.schoolId, publication.id);
    await this.event(client, actor, publication, event, generation, reason);
  }

  private event(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    publication: { id: string; slotId: string },
    event: 'PUBLISHED' | 'REVOKED' | 'SUPERSEDED',
    generation: number,
    reason?: string,
  ) {
    return client.resultReleaseEvent.create({
      data: {
        schoolId: actor.schoolId,
        publicationId: publication.id,
        slotId: publication.slotId,
        actorId: actor.actorId,
        event,
        publicationGeneration: generation,
        reason,
      },
    });
  }
}

export type ReleaseCandidate = Awaited<
  ReturnType<ResultReleaseRepository['candidate']>
>;
export type Publication = Awaited<
  ReturnType<ResultReleaseRepository['publication']>
>;

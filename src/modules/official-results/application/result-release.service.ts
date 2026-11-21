import { Injectable } from '@nestjs/common';
import type { Prisma, ResultReleaseCandidateStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { OfficialResultsError } from '../domain/official-results.error';
import { resultContentDigest } from '../domain/result-content-digest';
import {
  releaseInputs,
  releaseSnapshot,
  type ReleaseInput,
} from '../domain/result-release.contract';
import {
  ResultAuthorizationRepository,
  type ResultPermissionCheck,
} from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import {
  presentResultOperation,
  ResultOperationRepository,
} from '../infrastructure/repositories/result-operation.repository';
import { ResultPreviewRepository } from '../infrastructure/repositories/result-preview.repository';
import {
  ResultReleaseRepository,
  type Publication,
  type ReleaseCandidate,
} from '../infrastructure/repositories/result-release.repository';
import { requireResultActor } from './result-actor';
import { ResultGradebookService } from './result-gradebook.service';
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
import { ResultReleaseSnapshotService } from './result-release-snapshot.service';

type Surface = 'SCHOOL' | 'TEACHER';
type Tx = Prisma.TransactionClient;
type State = Awaited<ReturnType<ResultReleaseSnapshotService['authorizeSlot']>>;
type StagedRelease = {
  state: State;
  candidate: ReleaseCandidate;
  decisionId: string | null;
};
type ReviewQuery = ResultListQuery & {
  candidateKind?: 'RESULT_RELEASE' | 'AGGREGATE';
  candidateStatus?: ResultReleaseCandidateStatus;
  sheetId?: string;
  reportingPeriodId?: string;
  submitterId?: string;
};

const sorted = (values: readonly string[]) => [...values].sort();
const sameSet = (a: readonly string[], b: readonly string[]) =>
  sorted(a).join(',') === sorted(b).join(',');
const distinct = (keys: readonly string[]) => {
  if (new Set(keys).size !== keys.length)
    throw new ValidationDomainException('Duplicate publication target');
};

function describeCandidate(
  candidate: ReleaseCandidate,
  exposeDiagnostics: boolean,
) {
  const snapshot = releaseSnapshot.parse(candidate.snapshot);
  return {
    candidateKind: 'RESULT_RELEASE' as const,
    candidateId: candidate.id,
    candidateRevision: candidate.state.revision,
    contentDigest: candidate.contentDigest,
    status: candidate.state.status,
    intent: candidate.intent,
    sheetId: candidate.sheetId,
    slotId: candidate.slotId,
    definitionVersionId: candidate.definitionVersionId,
    releaseUnitId: candidate.releaseUnitId,
    sourceSlotRevision: candidate.capturedSlotRevision,
    submittedAt: candidate.submittedAt.toISOString(),
    completeness: snapshot.completeness,
    validationIssues: exposeDiagnostics ? snapshot.validationIssues : [],
    ...(exposeDiagnostics && candidate.decision?.comment
      ? { comment: candidate.decision.comment }
      : {}),
    capabilities: {},
  };
}

function describePublication(publication: Publication) {
  return {
    publicationId: publication.id,
    slotId: publication.slotId,
    candidateId: publication.candidateId,
    releaseUnitId: publication.releaseUnitId,
    definitionVersionId: publication.definitionVersionId,
    revision: publication.revision,
    publicationGeneration: publication.publicationGeneration,
    publishedAt: publication.publishedAt.toISOString(),
    predecessorId: publication.predecessorId,
    status: publication.activePointer
      ? ('ACTIVE' as const)
      : publication.events.some((event) => event.event === 'REVOKED')
        ? ('REVOKED' as const)
        : ('SUPERSEDED' as const),
    authorizationMode: publication.authorizationMode,
  };
}

@Injectable()
export class ResultReleaseService {
  constructor(
    private readonly auth: ResultAuthorizationRepository,
    private readonly commands: ResultCommandRepository,
    private readonly release: ResultReleaseRepository,
    private readonly snapshots: ResultReleaseSnapshotService,
    private readonly operations: ResultOperationRepository,
    private readonly gradebook: ResultGradebookService,
    private readonly previews: ResultPreviewRepository,
  ) {}

  capture(surface: Surface, input: ReleaseInput<'capture'>, key?: string) {
    return this.command(
      surface,
      'reviews.submit',
      'release.capture',
      key,
      input,
      async (client, access) => {
        const { actor } = access;
        distinct(
          input.units.map((item) => item.slotId + ':' + item.releaseUnitId),
        );
        const units = [...input.units].sort((a, b) =>
          (a.slotId + a.releaseUnitId).localeCompare(
            b.slotId + b.releaseUnitId,
          ),
        );
        const items: {
          sheetId: string;
          slotId: string;
          releaseUnitId: string;
          candidateId: string;
          status: 'COMPLETED';
        }[] = [];
        for (const unit of units) {
          const state = await this.snapshots.authorizeSlot(
            client,
            access,
            unit.slotId,
            unit.releaseUnitId,
            'SUBMIT',
          );
          if (state.sheet.id !== input.sheetId)
            throw new NotFoundDomainException();
          if (
            state.sheet.sheetRevision !== input.expectedSheetRevision ||
            state.slot.revision !== unit.expectedSlotRevision
          ) {
            throw new OfficialResultsError('candidate.stale');
          }
          const previous = (
            await this.release.current(client, actor.schoolId, unit.slotId)
          ).find(
            (row) => row.releaseUnitId === unit.releaseUnitId,
          )?.publication;
          const correction = previous
            ? await this.release.correction(
                client,
                actor.schoolId,
                unit.slotId,
                previous.id,
              )
            : null;
          const frozen = await this.snapshots.snapshot(
            client,
            state,
            unit.releaseUnitId,
            correction
              ? {
                  previousPublicationId: correction.previousPublicationId,
                  reason: correction.reason,
                }
              : null,
          );
          if (input.intent === 'DIRECT_PUBLICATION') {
            this.requireDirect(access, state, Boolean(previous));
            this.requireAccepted(state);
            this.snapshots.ensureReleasable(frozen.snapshot, state.context);
          }
          const target = {
            sheetId: state.sheet.id,
            slotId: unit.slotId,
            definitionVersionId: state.sheet.draftDefinitionVersionId,
            releaseUnitId: unit.releaseUnitId,
            policyVersionId: state.context.policyVersionId,
            correctionDraftId: correction?.id ?? null,
            capturedSlotRevision: state.slot.revision,
            intent: input.intent,
          };
          const candidate = await this.release.freeze(client, actor, {
            ...target,
            ...frozen,
            contentDigest: resultContentDigest({
              ...target,
              snapshot: frozen.snapshot,
            }),
          });
          items.push({
            sheetId: state.sheet.id,
            slotId: unit.slotId,
            releaseUnitId: unit.releaseUnitId,
            candidateId: candidate.id,
            status: 'COMPLETED',
          });
        }
        const operation = await this.operations.createBatch(
          client,
          actor,
          'CANDIDATE_CAPTURE',
          items,
        );
        await this.commands.audit(
          client,
          actor,
          'release.capture',
          'result_operation',
          operation.id,
          { count: items.length },
        );
        return presentResultOperation(operation, actor);
      },
    );
  }

  detail(surface: Surface, candidateId: string) {
    const actor = requireResultActor(surface);
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor);
      this.auth.requirePermission(access, 'official_results.sheets.view');
      const candidate = await this.release.candidate(
        client,
        actor.schoolId,
        candidateId,
      );
      await this.auth.authorizedTarget(
        client,
        access,
        candidate.slot.sheet,
        'VIEW',
      );
      return describeCandidate(candidate, surface === 'SCHOOL');
    });
  }

  previewCandidate(
    surface: Surface,
    candidateId: string,
    audience: 'STUDENT' | 'PARENT',
  ) {
    const actor = requireResultActor(surface);
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor);
      const candidate = await this.release.candidate(
        client,
        actor.schoolId,
        candidateId,
      );
      const workspace = await this.gradebook.workspace(
        client,
        access,
        candidate.slot.sheetId,
        'VIEW',
      );
      const snapshot = releaseSnapshot.parse(candidate.snapshot);
      if (
        surface === 'TEACHER' &&
        workspace.sheet.draftDefinitionVersionId !==
          candidate.definitionVersionId
      ) {
        throw new OfficialResultsError('candidate.stale');
      }
      const fields = familyReleaseFields(
        snapshot,
        candidate.definitionVersionId,
        audience,
        surface === 'TEACHER' ? workspace.fields : undefined,
      );
      const { academicContext, academicPlacement, student } =
        familyReleaseContext(snapshot);
      return {
        mode: 'PREVIEW' as const,
        audience,
        candidateId,
        result: {
          schemaVersion: '1.0' as const,
          source: 'OFFICIAL_RESULTS' as const,
          student,
          academicContext,
          groups: [
            {
              ...familyGroup(snapshot),
              releases: [
                {
                  status: 'PREVIEW' as const,
                  candidateId,
                  candidateRevision: candidate.state.revision,
                  publicationId: null,
                  publishedAt: null,
                  releaseUnitId: candidate.releaseUnitId,
                  releaseUnitLabel: snapshot.unit.label,
                  academicPlacement,
                  fields,
                  completeness:
                    surface === 'TEACHER' &&
                    fields.length !== snapshot.unit.outputFieldIds.length
                      ? ('PARTIAL' as const)
                      : snapshot.completeness,
                },
              ],
            },
          ],
        },
      };
    });
  }

  list(query: ReviewQuery) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor);
      this.auth.requirePermission(access, 'official_results.reviews.approve');
      const { limit: requested, cursor, ...filters } = query;
      if (filters.candidateKind === 'AGGREGATE' && filters.sheetId)
        throw new ValidationDomainException(
          'A sheet filters release candidates',
        );
      const { limit, after } = readResultCursor(
        { limit: requested, cursor },
        actor.schoolId,
        'release-reviews',
        filters,
      );
      const records =
        filters.candidateKind === 'AGGREGATE'
          ? []
          : await this.release.candidates(
              client,
              actor.schoolId,
              after,
              limit + 1,
              filters,
            );
      const candidates = records.flatMap((candidate) =>
        candidate.state
          ? [describeCandidate({ ...candidate, state: candidate.state }, true)]
          : [],
      );
      return presentResultPage(
        candidates,
        limit,
        (item) => item.candidateId,
        actor.schoolId,
        'release-reviews',
        filters,
      );
    });
  }

  decide(input: ReleaseInput<'decide'>, key?: string) {
    return this.command(
      'SCHOOL',
      'reviews.approve',
      'release.decide',
      key,
      input,
      async (client, access) => {
        if (input.candidateKind !== 'RESULT_RELEASE')
          throw new NotFoundDomainException();
        const prior = await this.release.candidate(
          client,
          access.actor.schoolId,
          input.candidateId,
        );
        const state = await this.snapshots.authorizeSlot(
          client,
          access,
          prior.slotId,
          prior.releaseUnitId,
          'VIEW',
          true,
        );
        const candidate = await this.checkedCandidate(client, access, input);
        await this.snapshots.current(client, candidate, state);
        if (input.decision === 'APPROVE') this.requireAccepted(state);
        this.assertReviewer(access, state, candidate);
        const decision = await this.release.decision(
          client,
          access.actor,
          candidate,
          input.decision,
          state.context.policyVersionId,
          input.comment,
        );
        await this.commands.audit(
          client,
          access.actor,
          'release.decide',
          'result_review_decision',
          decision.id,
          {
            candidateId: candidate.id,
            contentDigest: candidate.contentDigest,
            decision: decision.decision,
          },
        );
        return {
          decisionId: decision.id,
          candidateKind: 'RESULT_RELEASE' as const,
          candidateId: decision.candidateId,
          contentDigest: decision.contentDigest,
          decision: decision.decision,
          reviewerId: decision.reviewerId,
          decidedAt: decision.decidedAt.toISOString(),
          ...(decision.comment ? { comment: decision.comment } : {}),
        };
      },
    );
  }

  publish(surface: Surface, input: ReleaseInput<'publish'>, key?: string) {
    return this.command(
      surface,
      'publications.publish',
      'release.publish',
      key,
      input,
      async (client, access) => {
        const { actor } = access;
        distinct(input.candidateRefs.map((item) => item.candidateId));
        const found = await Promise.all(
          input.candidateRefs.map(async (ref) => ({
            ref,
            resource: await this.release.candidate(
              client,
              actor.schoolId,
              ref.candidateId,
            ),
          })),
        );
        found.sort((a, b) =>
          (a.resource.slotId + a.resource.releaseUnitId).localeCompare(
            b.resource.slotId + b.resource.releaseUnitId,
          ),
        );
        distinct(
          found.map(
            (item) => item.resource.slotId + ':' + item.resource.releaseUnitId,
          ),
        );
        const groups = new Map<string, typeof found>();
        for (const item of found) {
          const group = groups.get(item.resource.slotId) ?? [];
          group.push(item);
          groups.set(item.resource.slotId, group);
        }
        const items: {
          sheetId: string;
          slotId: string;
          releaseUnitId: string;
          publicationId: string;
          status: 'COMPLETED';
        }[] = [];
        for (const [slotId, selections] of groups) {
          const expected = selections[0].ref.expectedPublicationGeneration;
          const staged: (StagedRelease & { previous: Publication | null })[] =
            [];
          for (const { ref, resource } of selections) {
            const correction = ref.expectedCurrentPublicationId !== null;
            if (correction)
              this.auth.requirePermission(
                access,
                'official_results.publications.correct',
              );
            const state = await this.snapshots.authorizeSlot(
              client,
              access,
              slotId,
              resource.releaseUnitId,
              correction ? 'PUBLISH_CORRECTION' : 'PUBLISH',
            );
            if (
              state.slot.publicationGeneration !== expected ||
              ref.expectedPublicationGeneration !== expected
            ) {
              throw new OfficialResultsError('publication.stale');
            }
            const candidate = await this.checkedCandidate(client, access, ref);
            const previous =
              (await this.release.current(client, actor.schoolId, slotId)).find(
                (active) => active.releaseUnitId === resource.releaseUnitId,
              )?.publication ?? null;
            if (
              (previous?.id ?? null) !== ref.expectedCurrentPublicationId ||
              (resource.correction?.previousPublicationId ?? null) !==
                ref.expectedCurrentPublicationId
            ) {
              throw new OfficialResultsError('publication.stale');
            }
            const decisionId = await this.verifyForPublication(
              client,
              access,
              state,
              candidate,
              input.mode,
              correction,
            );
            staged.push({ state, candidate, previous, decisionId });
          }
          const active = await this.release.current(
            client,
            actor.schoolId,
            slotId,
          );
          const replaced = new Set(
            staged.flatMap((item) => (item.previous ? [item.previous.id] : [])),
          );
          this.assertDisjoint([
            ...active
              .filter((pointer) => !replaced.has(pointer.publicationId))
              .map((pointer) => pointer.publication.candidate),
            ...staged.map((item) => item.candidate),
          ]);
          const generation = await this.release.bump(
            client,
            actor.schoolId,
            slotId,
            expected,
          );
          for (const entry of staged) {
            if (entry.previous)
              await this.release.remove(
                client,
                actor,
                entry.previous,
                'SUPERSEDED',
                generation,
              );
            const publication = await this.release.issue(
              client,
              actor,
              entry.candidate,
              {
                generation,
                predecessorId: entry.previous?.id ?? null,
                decisionId: entry.decisionId,
                authMode: input.mode,
                policyVersionId: entry.state.context.policyVersionId,
                notify: entry.previous
                  ? entry.state.context.settings.notifications.onCorrection
                  : entry.state.context.settings.notifications.onPublication,
              },
            );
            items.push({
              sheetId: entry.state.sheet.id,
              slotId,
              releaseUnitId: publication.releaseUnitId,
              publicationId: publication.id,
              status: 'COMPLETED',
            });
          }
        }
        const operation = await this.operations.createBatch(
          client,
          actor,
          'PUBLICATION_BATCH',
          items,
        );
        await this.commands.audit(
          client,
          actor,
          'release.publish',
          'result_operation',
          operation.id,
          { count: items.length, mode: input.mode },
        );
        return presentResultOperation(operation, actor);
      },
    );
  }

  publication(surface: Surface, id: string) {
    const actor = requireResultActor(surface);
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor);
      this.auth.requirePermission(access, 'official_results.sheets.view');
      const publication = await this.release.publication(
        client,
        actor.schoolId,
        id,
      );
      await this.auth.authorizedTarget(
        client,
        access,
        publication.candidate.slot.sheet,
        'VIEW',
      );
      return describePublication(publication);
    });
  }

  correction(
    surface: Surface,
    input: ReleaseInput<'correction'>,
    key?: string,
  ) {
    const operationId = randomUUID();
    return this.command(
      surface,
      'corrections.request',
      'release.correction',
      key,
      input,
      async (client, access) => {
        const { actor } = access;
        const publication = await this.release.publication(
          client,
          actor.schoolId,
          input.publicationId,
        );
        const { slotId, releaseUnitId } = publication;
        const state = await this.snapshots.authorizeSlot(
          client,
          access,
          slotId,
          releaseUnitId,
          'REQUEST_CORRECTION',
        );
        await this.requireCurrentPublication(
          client,
          access,
          publication,
          state,
          input,
        );
        if (input.operations) {
          const snapshot = releaseSnapshot.parse(
            publication.candidate.snapshot,
          );
          const fields = new Set(
            snapshot.fields.map((entry) => entry.definition.id),
          );
          if (
            input.operations.some(
              (item) => item.slotId !== slotId || !fields.has(item.fieldId),
            )
          )
            throw new NotFoundDomainException();
          const workspace = await this.gradebook.workspace(
            client,
            access,
            state.sheet.id,
            'EDIT',
            { slotId, releaseUnitId },
          );
          await this.gradebook.mutate(
            client,
            access,
            workspace,
            {
              expectedDefinitionVersionId: state.sheet.draftDefinitionVersionId,
              expectedSheetRevision: state.sheet.sheetRevision,
              operations: input.operations,
              changeReason: input.reason,
            },
            operationId,
            'GRID',
          );
        }
        const correction = await this.release.openCorrection(
          client,
          actor,
          publication,
          input.reason,
        );
        await this.commands.audit(
          client,
          actor,
          'release.correction',
          'result_correction_draft',
          correction.id,
          {
            publicationId: publication.id,
            reason: input.reason,
            slotId,
          },
        );
        return {
          sheetId: state.sheet.id,
          slotId,
          previousPublicationId: publication.id,
          reason: correction.reason,
          draftDefinitionVersionId: state.sheet.draftDefinitionVersionId,
          sheetRevision: state.sheet.sheetRevision,
          correctionId: correction.id,
          capabilities: {},
        };
      },
    );
  }

  revoke(id: string, input: ReleaseInput<'revoke'>, key?: string) {
    return this.command(
      'SCHOOL',
      'publications.revoke',
      'release.revoke',
      key,
      { id, ...input },
      async (client, access) => {
        const { actor } = access;
        if (id !== input.expectedPublicationId)
          throw new OfficialResultsError('publication.stale');
        const publication = await this.release.publication(
          client,
          actor.schoolId,
          id,
        );
        const state = await this.snapshots.authorizeSlot(
          client,
          access,
          publication.slotId,
          publication.releaseUnitId,
          'PUBLISH',
          true,
          true,
        );
        await this.requireCurrentPublication(
          client,
          access,
          publication,
          state,
          input,
        );
        const generation = await this.release.bump(
          client,
          actor.schoolId,
          publication.slotId,
          input.expectedPublicationGeneration,
        );
        await this.release.remove(
          client,
          actor,
          publication,
          'REVOKED',
          generation,
          input.reason,
        );
        await this.commands.audit(
          client,
          actor,
          'release.revoke',
          'result_publication',
          id,
          { publicationGeneration: generation, reason: input.reason },
        );
        return describePublication(
          await this.release.publication(client, actor.schoolId, id),
        );
      },
    );
  }

  topologyPreview(slotId: string, input: ReleaseInput<'topologyPreview'>) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor, {
        write: true,
      });
      this.auth.requirePermission(
        access,
        'official_results.publications.publish',
      );
      const plan = await this.topologyPlan(client, access, slotId, input);
      const preview = await this.previews.create(
        client,
        actor,
        'PUBLICATION_TOPOLOGY',
        slotId,
        { input, fingerprint: plan.fingerprint },
      );
      return {
        ...preview,
        impacts: [
          {
            kind: 'PUBLICATION_TOPOLOGY',
            resourceId: slotId,
            before: {
              activePublicationIds: input.expectedActivePublicationIds,
            },
            after: {
              preservedPublicationIds: input.preservedPublicationIds,
              candidateIds: input.candidateRefs.map((ref) => ref.candidateId),
            },
          },
        ],
        blockers: [],
      };
    });
  }

  topologyReplace(
    slotId: string,
    input: ReleaseInput<'topologyReplace'>,
    key?: string,
  ) {
    return this.command(
      'SCHOOL',
      'publications.publish',
      'release.topology',
      key,
      { slotId, ...input },
      async (client, access) => {
        const { actor } = access;
        const saved = await this.previews.load(
          client,
          actor,
          'PUBLICATION_TOPOLOGY',
          slotId,
          input.previewId,
          input.previewDigest,
        );
        const binding = saved as unknown as {
          input: unknown;
          fingerprint: string;
        };
        const reviewed = releaseInputs.topologyPreview.parse(binding.input);
        if (
          reviewed.expectedPublicationGeneration !==
          input.expectedPublicationGeneration
        )
          throw new OfficialResultsError('preview.stale');
        const { fingerprint, replacements, retiring } = await this.topologyPlan(
          client,
          access,
          slotId,
          reviewed,
        );
        if (fingerprint !== binding.fingerprint)
          throw new OfficialResultsError('preview.stale');
        const generation = await this.release.bump(
          client,
          actor.schoolId,
          slotId,
          input.expectedPublicationGeneration,
        );
        for (const prior of retiring)
          await this.release.remove(
            client,
            actor,
            prior,
            'SUPERSEDED',
            generation,
            reviewed.reason,
          );
        for (const { candidate, state, decisionId } of replacements) {
          const predecessor =
            retiring.find(
              (prior) => prior.releaseUnitId === candidate.releaseUnitId,
            )?.id ?? null;
          await this.release.issue(client, actor, candidate, {
            generation,
            predecessorId: predecessor,
            decisionId,
            authMode: 'APPROVED',
            policyVersionId: state.context.policyVersionId,
            notify: state.context.settings.notifications.onCorrection,
          });
        }
        await this.commands.audit(
          client,
          actor,
          'release.topology',
          'result_slot',
          slotId,
          {
            publicationGeneration: generation,
            reason: reviewed.reason,
            replaced: retiring.map((item) => item.id),
          },
        );
        return {
          slotId,
          publicationGeneration: generation,
          replacedPublicationIds: retiring.map((item) => item.id),
          preservedPublicationIds: reviewed.preservedPublicationIds,
          activePublications: (
            await this.release.current(client, actor.schoolId, slotId)
          ).map((pointer) => describePublication(pointer.publication)),
        };
      },
    );
  }

  private async topologyPlan(
    client: Tx,
    access: ResultPermissionCheck,
    slotId: string,
    input: ReleaseInput<'topologyPreview'>,
  ) {
    this.auth.requirePermission(
      access,
      'official_results.publications.correct',
    );
    const { actor } = access;
    distinct(input.candidateRefs.map((ref) => ref.candidateId));
    const replacements: StagedRelease[] = [];
    for (const ref of input.candidateRefs) {
      const prior = await this.release.candidate(
        client,
        actor.schoolId,
        ref.candidateId,
      );
      if (
        prior.slotId !== slotId ||
        prior.definitionVersionId !== input.targetDefinitionVersionId
      )
        throw new NotFoundDomainException();
      const state = await this.snapshots.authorizeSlot(
        client,
        access,
        slotId,
        prior.releaseUnitId,
        'PUBLISH_CORRECTION',
      );
      if (
        state.slot.publicationGeneration !== input.expectedPublicationGeneration
      )
        throw new OfficialResultsError('publication.stale');
      const candidate = await this.checkedCandidate(client, access, ref);
      const decisionId = await this.verifyForPublication(
        client,
        access,
        state,
        candidate,
        'APPROVED',
        true,
      );
      replacements.push({ candidate, state, decisionId });
    }
    const active = await this.release.current(client, actor.schoolId, slotId);
    const activeIds = active.map((pointer) => pointer.publicationId);
    if (
      !sameSet(activeIds, input.expectedActivePublicationIds) ||
      input.preservedPublicationIds.some((id) => !activeIds.includes(id))
    )
      throw new OfficialResultsError('publication.stale');
    const retiring = active
      .filter(
        (pointer) =>
          !input.preservedPublicationIds.includes(pointer.publicationId),
      )
      .map((pointer) => pointer.publication);
    if (!retiring.length)
      throw new OfficialResultsError('publication.topology');
    const preserved = active.filter((pointer) =>
      input.preservedPublicationIds.includes(pointer.publicationId),
    );
    this.assertDisjoint([
      ...preserved.map((pointer) => pointer.publication.candidate),
      ...replacements.map((item) => item.candidate),
    ]);
    return {
      replacements,
      retiring,
      fingerprint: resultContentDigest({
        input,
        activeIds: sorted(activeIds),
        candidates: replacements.map(({ candidate }) => ({
          id: candidate.id,
          revision: candidate.state.revision,
          digest: candidate.contentDigest,
          policy: candidate.policyVersionId,
        })),
      }),
    };
  }

  private async verifyForPublication(
    client: Tx,
    access: ResultPermissionCheck,
    state: State,
    candidate: ReleaseCandidate,
    mode: ReleaseInput<'publish'>['mode'],
    correction: boolean,
  ) {
    this.requireAccepted(state);
    const basis = await this.snapshots.current(client, candidate, state);
    this.snapshots.ensureReleasable(basis, state.context);
    if (access.actor.userType === 'TEACHER' || mode === 'DIRECT')
      this.requireDirect(access, state, correction);
    if (mode === 'DIRECT') {
      if (candidate.state.status !== 'READY_FOR_DIRECT')
        throw new OfficialResultsError('review.required');
      return null;
    }
    if (mode === 'APPROVE_AND_PUBLISH') {
      if (state.context.settings.publishAfterApproval !== 'ON_APPROVAL')
        throw new OfficialResultsError('publication.forbidden');
      this.assertReviewer(access, state, candidate);
      return (
        await this.release.decision(
          client,
          access.actor,
          candidate,
          'APPROVE',
          state.context.policyVersionId,
        )
      ).id;
    }
    if (
      candidate.state.status !== 'APPROVED' ||
      candidate.decision?.decision !== 'APPROVE' ||
      candidate.decision.contentDigest !== candidate.contentDigest ||
      candidate.decision.policyVersionId !== state.context.policyVersionId
    ) {
      throw new OfficialResultsError('review.required');
    }
    return candidate.decision.id;
  }

  private requireDirect(
    access: ResultPermissionCheck,
    state: State,
    correction: boolean,
  ) {
    this.auth.requirePermission(
      access,
      'official_results.publications.publish',
    );
    if (correction)
      this.auth.requirePermission(
        access,
        'official_results.publications.correct',
      );
    const setting = correction
      ? state.context.settings.correctionPublication
      : state.context.settings.firstPublication;
    if (
      setting !== 'DIRECT_IF_AUTHORIZED' ||
      (access.actor.userType === 'TEACHER' &&
        state.context.settings.teacherMode !== 'AUTONOMOUS')
    ) {
      throw new OfficialResultsError('review.required');
    }
  }

  private requireAccepted(state: State) {
    if (
      state.sheet.lastAcceptedDefinitionVersionId !==
      state.sheet.draftDefinitionVersionId
    ) {
      throw new OfficialResultsError('review.required');
    }
  }

  private assertReviewer(
    access: ResultPermissionCheck,
    state: State,
    candidate: ReleaseCandidate,
  ) {
    this.auth.requirePermission(access, 'official_results.reviews.approve');
    if (
      access.actor.userType === 'TEACHER' ||
      (state.context.settings.requireDistinctApprover &&
        access.actor.actorId === candidate.submittedById)
    ) {
      throw new OfficialResultsError('publication.forbidden');
    }
  }

  private async checkedCandidate(
    client: Tx,
    access: ResultPermissionCheck,
    reference: Pick<
      ReleaseInput<'decide'>,
      'candidateId' | 'contentDigest' | 'expectedCandidateRevision'
    >,
  ) {
    const candidate = await this.release.candidate(
      client,
      access.actor.schoolId,
      reference.candidateId,
    );
    if (
      candidate.contentDigest !== reference.contentDigest ||
      candidate.state.revision !== reference.expectedCandidateRevision ||
      candidate.state.status === 'SUPERSEDED' ||
      candidate.state.status === 'RETURNED'
    ) {
      throw new OfficialResultsError('candidate.stale');
    }
    return candidate;
  }

  private async requireCurrentPublication(
    client: Tx,
    access: ResultPermissionCheck,
    prior: Publication,
    state: State,
    input: { expectedRevision: number; expectedPublicationGeneration: number },
  ) {
    if (
      input.expectedRevision !== prior.revision ||
      input.expectedPublicationGeneration !==
        state.slot.publicationGeneration ||
      !(
        await this.release.current(client, access.actor.schoolId, prior.slotId)
      ).some((pointer) => pointer.publicationId === prior.id)
    ) {
      throw new OfficialResultsError('publication.stale');
    }
  }

  private assertDisjoint(
    candidates: { releaseUnitId: string; snapshot: Prisma.JsonValue }[],
  ) {
    const units = new Set<string>();
    const dependencies = new Set<string>();
    for (const candidate of candidates) {
      const snapshot = releaseSnapshot.parse(candidate.snapshot);
      if (
        units.has(candidate.releaseUnitId) ||
        snapshot.fields.some((field) => dependencies.has(field.definition.id))
      ) {
        throw new OfficialResultsError('publication.topology');
      }
      units.add(candidate.releaseUnitId);
      snapshot.fields.forEach((field) => dependencies.add(field.definition.id));
    }
  }

  private command<T extends Prisma.InputJsonObject>(
    surface: Surface,
    permission: string,
    operation: string,
    key: string | undefined,
    input: unknown,
    perform: (client: Tx, access: ResultPermissionCheck) => Promise<T>,
  ) {
    const actor = requireResultActor(surface);
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor, {
        write: true,
      });
      this.auth.requirePermission(access, 'official_results.' + permission);
      return this.commands.idempotent(
        client,
        actor,
        operation,
        key,
        input,
        () => perform(client, access),
      );
    });
  }
}

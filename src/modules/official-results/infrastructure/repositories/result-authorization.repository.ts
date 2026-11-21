import { Injectable } from '@nestjs/common';
import { Prisma, UserType, type ResultGrantAction } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  TeacherAllocationOperationalWriteGate,
  TeacherAllocationOperationalWriteGateError,
} from '../../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import type { ResultActor } from '../../application/result-actor';
import type { ResultSheetTarget } from '../../application/result-foundation.types';
import { OfficialResultsError } from '../../domain/official-results.error';
import {
  effectiveResultPolicy,
  managedResultPolicy,
  parseResultPolicy,
  type ResultPolicy,
  type ResultPolicySettings,
} from '../../domain/result-policy';
import { ResultRosterRepository } from './result-roster.repository';
import {
  ResultScopeFactsRepository,
  resultClassroomPath,
} from './result-scope-facts.repository';

const policyVersionSelect = {
  id: true,
  revision: true,
  configuration: true,
} satisfies Prisma.OfficialResultPolicyVersionSelect;

export interface ResultPermissionCheck {
  permissions: ReadonlySet<string>;
  actor: ResultActor;
}

@Injectable()
export class ResultAuthorizationRepository {
  constructor(
    private readonly academic: ResultRosterRepository,
    private readonly scopeFacts: ResultScopeFactsRepository,
    private readonly allocationGate: TeacherAllocationOperationalWriteGate,
  ) {}

  async permissions(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    options: { write?: boolean; policyChange?: boolean } = {},
  ): Promise<ResultPermissionCheck> {
    // Policy activation takes the exclusive side of the same school lock that
    // protects other result commands, including the first activation.
    if (options.write) {
      await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM schools
        WHERE id = ${actor.schoolId}::uuid
        ${options.policyChange ? Prisma.sql`FOR NO KEY UPDATE` : Prisma.sql`FOR SHARE`}
      `);
    }
    const rows = await client.$queryRaw<Array<{ code: string }>>(Prisma.sql`
      SELECT p.code
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      JOIN roles r ON r.id = m.role_id
      JOIN role_permissions rp ON rp.role_id = r.id
      JOIN permissions p ON p.id = rp.permission_id
      JOIN schools s ON s.id = ${actor.schoolId}::uuid AND s.organization_id = m.organization_id
      JOIN organizations o ON o.id = s.organization_id
      WHERE m.id = ${actor.membershipId}::uuid
        AND m.user_id = ${actor.actorId}::uuid
        AND m.role_id = ${actor.roleId}::uuid
        AND m.organization_id = ${actor.organizationId}::uuid
        AND m.user_type::text = ${actor.userType} AND u.user_type::text = ${actor.userType}
        AND m.status = 'ACTIVE' AND m.ended_at IS NULL AND m.deleted_at IS NULL
        AND (m.school_id = s.id OR (m.school_id IS NULL AND m.user_type = 'ORGANIZATION_USER'))
        AND u.status = 'ACTIVE' AND u.deleted_at IS NULL AND r.deleted_at IS NULL
        AND (r.school_id IS NULL OR r.school_id = s.id)
        AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
        AND o.status = 'ACTIVE' AND o.deleted_at IS NULL
        AND p.module = 'official_results'
      ORDER BY p.code
      ${options.write ? Prisma.sql`FOR SHARE OF m, u, r, rp, p, s, o` : Prisma.empty}
    `);
    return { actor, permissions: new Set(rows.map(({ code }) => code)) };
  }

  requirePermission(access: ResultPermissionCheck, required: string): void {
    if (!access.permissions.has(required)) throw new NotFoundDomainException();
  }

  async currentPolicy(client: Prisma.TransactionClient, schoolId: string) {
    const root = await client.officialResultPolicy.findFirst({
      where: { schoolId },
      select: { id: true, activeVersion: { select: policyVersionSelect } },
    });
    return {
      rootId: root?.id,
      id: root?.activeVersion?.id ?? null,
      revision: root?.activeVersion?.revision ?? 0,
      policy: root?.activeVersion
        ? parseResultPolicy(root.activeVersion.configuration)
        : managedResultPolicy(),
    };
  }

  async authorizedTarget(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    target: ResultSheetTarget,
    action: ResultGrantAction,
    options: {
      write?: boolean;
      review?: boolean;
      slotId?: string;
      releaseUnitId?: string;
    } = {},
  ) {
    const { actor } = access;
    if (options.write) {
      await client.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM result_reporting_periods
        WHERE school_id = ${actor.schoolId}::uuid AND id = ${target.reportingPeriodId}::uuid
        FOR SHARE
      `;
    }
    const context = await this.academic.resolveTarget(
      client,
      actor.schoolId,
      target,
      Boolean(options.write),
    );
    if (actor.userType === UserType.TEACHER) {
      const { period, group } = context;
      if (period.termId && group.subjectId) {
        await this.requireTeacherAllocation(
          client,
          actor,
          {
            classroomId: target.classroomId,
            termId: period.termId,
            subjectId: group.subjectId,
          },
          Boolean(options.write),
        );
      } else if (
        !(await this.hasGrant(
          client,
          actor,
          target,
          action,
          Boolean(options.write),
        ))
      ) {
        throw new NotFoundDomainException();
      }
    }

    if (options.write && context.period.status !== 'OPEN') {
      const releaseAction =
        action === 'PUBLISH' || action === 'PUBLISH_CORRECTION';
      const entryClosedRelease =
        context.period.status === 'ENTRY_CLOSED' &&
        (releaseAction || options.review);
      const correctionAllowed =
        options.slotId &&
        options.releaseUnitId &&
        (await this.hasCorrectionWindow(
          client,
          actor,
          target,
          options.slotId,
          options.releaseUnitId,
        ));
      if (!entryClosedRelease && !correctionAllowed) {
        throw new OfficialResultsError('period.closed');
      }
    }

    const policy = await this.currentPolicy(client, actor.schoolId);
    const settings = await this.scopedSettings(
      client,
      actor.schoolId,
      policy.policy,
      context,
    );
    return {
      ...context,
      ...settings,
      policyVersionId: policy.id,
      policyRevision: policy.revision,
    };
  }

  async grantedActions(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    target: ResultSheetTarget,
  ) {
    const now = new Date();
    const grants = await client.officialResultScopeGrant.findMany({
      where: {
        schoolId: actor.schoolId,
        reportingPeriodIds: { has: target.reportingPeriodId },
        groupIds: { has: target.groupId },
        classroomIds: { has: target.classroomId },
        fieldIds: { isEmpty: true },
        startsAt: { lte: now },
        revokedAt: null,
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
      select: { actions: true },
    });
    return new Set(grants.flatMap(({ actions }) => actions));
  }

  async fieldGrants(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    target: ResultSheetTarget,
    write: boolean,
  ) {
    const rows = await client.$queryRaw<
      Array<{ fieldIds: string[]; actions: ResultGrantAction[] }>
    >(Prisma.sql`
      SELECT field_ids AS "fieldIds", actions
      FROM official_result_scope_grants
      WHERE school_id = ${actor.schoolId}::uuid
        AND (grantee_user_id = ${actor.actorId}::uuid OR grantee_role_id = ${actor.roleId}::uuid)
        AND starts_at <= clock_timestamp() AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > clock_timestamp())
        AND ${target.reportingPeriodId}::uuid = ANY(reporting_period_ids)
        AND ${target.classroomId}::uuid = ANY(classroom_ids)
        AND ${target.groupId}::uuid = ANY(group_ids)
        AND cardinality(field_ids) > 0
      ORDER BY id
      ${write ? Prisma.sql`FOR SHARE` : Prisma.empty}
    `);
    const scopes = new Map<string, Set<ResultGrantAction>>();
    for (const row of rows) {
      for (const fieldId of row.fieldIds) {
        const actions = scopes.get(fieldId) ?? new Set<ResultGrantAction>();
        row.actions.forEach((action) => actions.add(action));
        scopes.set(fieldId, actions);
      }
    }
    return scopes;
  }

  hasHistoricalEditGrant(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    target: ResultSheetTarget,
    write: boolean,
  ) {
    return this.hasGrant(client, actor, target, 'EDIT', write);
  }

  assertDirectPublication(
    actor: ResultActor,
    settings: ResultPolicySettings,
    correction: boolean,
  ): void {
    if (settings.publicationSuspended) {
      throw new OfficialResultsError('publication.forbidden');
    }
    if (actor.userType !== UserType.TEACHER) return;
    const mode = correction
      ? settings.correctionPublication
      : settings.firstPublication;
    if (
      settings.teacherMode !== 'AUTONOMOUS' ||
      mode !== 'DIRECT_IF_AUTHORIZED'
    ) {
      throw new OfficialResultsError('review.required');
    }
  }

  private async scopedSettings(
    client: Prisma.TransactionClient,
    schoolId: string,
    policy: ResultPolicy,
    target: Awaited<ReturnType<ResultRosterRepository['resolveTarget']>>,
  ) {
    const facts = await this.scopeFacts.forSelectors(
      client,
      schoolId,
      policy.scopedOverrides,
      false,
    );
    return effectiveResultPolicy(
      policy,
      {
        academic: resultClassroomPath(target.classroom),
        groupId: target.group.id,
        subjectId: target.group.subjectId,
        period: target.period,
      },
      facts,
    );
  }

  private async requireTeacherAllocation(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    target: { classroomId: string; termId: string; subjectId: string },
    write: boolean,
  ): Promise<void> {
    const allocation = await client.teacherSubjectAllocation.findFirst({
      where: {
        schoolId: actor.schoolId,
        teacherUserId: actor.actorId,
        ...target,
      },
      select: { id: true },
    });
    if (!allocation) throw new NotFoundDomainException();
    if (!write) return;
    try {
      const [locked] = await this.allocationGate.lock(client, {
        schoolId: actor.schoolId,
        allocationIds: [allocation.id],
        expectedTeacherUserId: actor.actorId,
      });
      if (
        locked.classroomId !== target.classroomId ||
        locked.termId !== target.termId ||
        locked.subjectId !== target.subjectId
      )
        throw new NotFoundDomainException();
    } catch (error) {
      if (error instanceof TeacherAllocationOperationalWriteGateError) {
        throw new NotFoundDomainException();
      }
      throw error;
    }
  }

  private async hasGrant(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    target: ResultSheetTarget,
    action: ResultGrantAction,
    lock: boolean,
  ): Promise<boolean> {
    const rows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM official_result_scope_grants
      WHERE school_id = ${actor.schoolId}::uuid
        AND (grantee_user_id = ${actor.actorId}::uuid OR grantee_role_id = ${actor.roleId}::uuid)
        AND revoked_at IS NULL AND starts_at <= clock_timestamp()
        AND (expires_at IS NULL OR expires_at > clock_timestamp())
        AND ${target.groupId}::uuid = ANY(group_ids)
        AND ${target.classroomId}::uuid = ANY(classroom_ids)
        AND ${target.reportingPeriodId}::uuid = ANY(reporting_period_ids)
        AND ${action}::result_grant_action = ANY(actions)
        AND cardinality(field_ids) = 0
      ORDER BY id
      LIMIT 1
      ${lock ? Prisma.sql`FOR SHARE` : Prisma.empty}
    `);
    return rows.length > 0;
  }

  private async hasCorrectionWindow(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    target: ResultSheetTarget,
    slotId: string,
    releaseUnitId: string,
  ): Promise<boolean> {
    const rows = await client.$queryRaw<Array<{ id: string }>>`
      SELECT w.id FROM result_correction_windows w
      JOIN result_slots sl ON sl.id = w.slot_id AND sl.school_id = w.school_id
      JOIN result_sheets sh ON sh.id = sl.sheet_id AND sh.school_id = sl.school_id
      WHERE w.school_id = ${actor.schoolId}::uuid AND w.actor_id = ${actor.actorId}::uuid
        AND w.reporting_period_id = ${target.reportingPeriodId}::uuid AND sl.id = ${slotId}::uuid
        AND sh.classroom_id = ${target.classroomId}::uuid AND sh.group_id = ${target.groupId}::uuid
        AND w.release_unit_id = ${releaseUnitId}::uuid
        AND w.revoked_at IS NULL AND w.expires_at > clock_timestamp()
      ORDER BY w.id LIMIT 1 FOR SHARE OF w
    `;
    return rows.length > 0;
  }
}

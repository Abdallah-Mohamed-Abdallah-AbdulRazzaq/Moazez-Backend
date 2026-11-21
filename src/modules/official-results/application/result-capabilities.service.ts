import { Injectable } from '@nestjs/common';
import type { ResultGrantAction } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { ResultAuthorizationRepository } from '../infrastructure/repositories/result-authorization.repository';
import { ResultCatalogRepository } from '../infrastructure/repositories/result-catalog.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import { requireResultActor } from './result-actor';

const capabilityRules = {
  canView: { permission: 'sheets.view', action: 'VIEW', entry: false },
  canCreateSheet: {
    permission: 'sheets.create',
    action: 'DESIGN',
    entry: true,
  },
  canEnter: { permission: 'entries.manage', action: 'EDIT', entry: true },
  canDesign: { permission: 'designs.manage', action: 'DESIGN', entry: true },
  canExport: { permission: 'exports.create', action: 'EXPORT', entry: false },
  canImport: { permission: 'imports.manage', action: 'IMPORT', entry: true },
  canSubmit: { permission: 'reviews.submit', action: 'SUBMIT', entry: true },
  canApprove: { permission: 'reviews.approve', action: 'VIEW', entry: false },
  canPublish: {
    permission: 'publications.publish',
    action: 'PUBLISH',
    entry: false,
  },
  canRequestCorrection: {
    permission: 'corrections.request',
    action: 'REQUEST_CORRECTION',
    entry: false,
  },
  canPublishCorrection: {
    permission: 'publications.correct',
    action: 'PUBLISH_CORRECTION',
    entry: false,
  },
  canReconcileRoster: {
    permission: 'rosters.manage',
    action: 'VIEW',
    entry: true,
  },
} as const satisfies Record<
  string,
  { permission: string; action: ResultGrantAction; entry: boolean }
>;

export interface ResultCapabilitiesQuery {
  sheetId?: string;
  slotId?: string;
  reportingPeriodId?: string;
  groupId?: string;
}

@Injectable()
export class ResultCapabilitiesService {
  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly authorization: ResultAuthorizationRepository,
    private readonly catalog: ResultCatalogRepository,
  ) {}

  read(surface: 'SCHOOL' | 'TEACHER', query: ResultCapabilitiesQuery) {
    const actor = requireResultActor(surface);
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor);
      this.authorization.requirePermission(
        access,
        'official_results.sheets.view',
      );
      const visible = await this.catalog.visibleIds(client, actor);
      const target = await this.catalog.capabilityTarget(
        client,
        actor.schoolId,
        query,
      );
      if (
        query.reportingPeriodId &&
        visible.periodIds &&
        !visible.periodIds.includes(query.reportingPeriodId)
      ) {
        throw new NotFoundDomainException();
      }
      if (
        query.groupId &&
        visible.groupIds &&
        !visible.groupIds.includes(query.groupId)
      ) {
        throw new NotFoundDomainException();
      }
      if (!target) {
        return {
          capabilities: Object.fromEntries(
            Object.entries(capabilityRules).map(([name, rule]) => [
              name,
              access.permissions.has(`official_results.${rule.permission}`)
                ? { allowed: true }
                : { allowed: false, reasonCode: 'MISSING_PERMISSION' },
            ]),
          ),
          allowedScopeSelectors: [
            'SCHOOL',
            'STAGE',
            'GRADE',
            'SECTION',
            'CLASSROOM',
          ],
        };
      }
      const context = await this.authorization.authorizedTarget(
        client,
        access,
        target,
        'VIEW',
      );
      const grantsOnly =
        actor.userType === 'TEACHER' &&
        (!context.period.termId || !context.group.subjectId);
      const scopedGrants = grantsOnly
        ? await this.authorization.grantedActions(client, actor, target)
        : new Set<ResultGrantAction>();

      const entries = Object.entries(capabilityRules).map(([name, rule]) => {
        let reasonCode: string | undefined;
        const corrections = rule.action === 'PUBLISH_CORRECTION';
        const publication = rule.action === 'PUBLISH' || corrections;
        if (
          !access.permissions.has(`official_results.${rule.permission}`) ||
          (corrections &&
            !access.permissions.has('official_results.publications.publish'))
        ) {
          reasonCode = 'MISSING_PERMISSION';
        } else if (grantsOnly && !scopedGrants.has(rule.action)) {
          reasonCode = 'SCOPE_NOT_ASSIGNED';
        } else if (
          (rule.entry && context.period.status !== 'OPEN') ||
          (publication && context.period.status === 'ARCHIVED')
        ) {
          reasonCode = 'PERIOD_CLOSED';
        } else if (publication && context.settings.publicationSuspended) {
          reasonCode = 'PUBLICATION_SUSPENDED';
        } else if (
          publication &&
          actor.userType === 'TEACHER' &&
          (context.settings.teacherMode !== 'AUTONOMOUS' ||
            (corrections
              ? context.settings.correctionPublication
              : context.settings.firstPublication) !== 'DIRECT_IF_AUTHORIZED')
        ) {
          reasonCode = 'POLICY_REVIEW_REQUIRED';
        }
        return [
          name,
          reasonCode ? { allowed: false, reasonCode } : { allowed: true },
        ];
      });
      return {
        capabilities: Object.fromEntries(entries),
        policyVersionId: context.policyVersionId,
        policyRevision: context.policyRevision,
        teacherMode: context.settings.teacherMode,
        sheetId: target.id,
        reportingPeriodId: target.reportingPeriodId,
        groupId: target.groupId,
        allowedScopeSelectors: [
          'SCHOOL',
          'STAGE',
          'GRADE',
          'SECTION',
          'CLASSROOM',
        ],
        matchedPolicyRules: context.origins,
      };
    });
  }
}

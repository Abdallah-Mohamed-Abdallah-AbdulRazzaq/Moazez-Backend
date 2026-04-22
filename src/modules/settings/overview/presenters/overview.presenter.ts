import { OverviewResponseDto, RecentAuditEventDto } from '../dto/overview-response.dto';
import {
  OverviewAuditRecord,
  OverviewMetricsRecord,
} from '../infrastructure/overview.repository';

function resolveSeverity(action: string, module: string): RecentAuditEventDto['severity'] {
  if (
    module === 'settings' &&
    (action === 'security.change' || action === 'settings.security.change')
  ) {
    return 'critical';
  }

  if (
    module === 'settings' ||
    (module === 'iam' &&
      (action.startsWith('role.') || action.startsWith('iam.role.'))) ||
    (module === 'iam' &&
      (action.startsWith('user.') || action.startsWith('iam.user.')))
  ) {
    return 'warning';
  }

  return 'info';
}

function presentAuditEvent(record: OverviewAuditRecord): RecentAuditEventDto {
  const actorName = record.actor
    ? `${record.actor.firstName} ${record.actor.lastName}`.trim()
    : null;

  return {
    id: record.id,
    actor: actorName && actorName.length > 0 ? actorName : null,
    action: record.action,
    module: record.module,
    entity: record.resourceId ?? record.resourceType ?? null,
    severity: resolveSeverity(record.action, record.module),
    timestamp: record.createdAt.toISOString(),
    ipAddress: record.ipAddress ?? null,
  };
}

export function presentOverview(
  metrics: OverviewMetricsRecord,
  auditEvents: OverviewAuditRecord[],
): OverviewResponseDto {
  return {
    profileCompleteness: metrics.profileCompleteness,
    activeUsersCount: metrics.activeUsersCount,
    pendingInvitesCount: metrics.pendingInvitesCount,
    recentAuditEvents: auditEvents.map(presentAuditEvent),
  };
}

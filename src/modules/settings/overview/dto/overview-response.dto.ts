export class RecentAuditEventDto {
  id!: string;
  actor!: string | null;
  action!: string;
  module!: string;
  entity!: string | null;
  severity!: 'info' | 'warning' | 'critical';
  timestamp!: string;
  ipAddress!: string | null;
}

export class OverviewResponseDto {
  profileCompleteness!: number;
  activeUsersCount!: number;
  pendingInvitesCount!: number;
  recentAuditEvents!: RecentAuditEventDto[];
}

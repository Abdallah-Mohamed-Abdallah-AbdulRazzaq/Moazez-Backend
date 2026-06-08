export class PlatformAdminStatusCountersDto {
  total!: number;
  active!: number;
  suspended!: number;
  archived!: number;
}

export class PlatformAdminDeferredDto {
  schoolProvisioning!: 'available';
  entitlements!: 'deferred';
  featureControl!: 'deferred';
  billing!: 'out_of_scope_v1';
  advancedAnalytics!: 'deferred';
}

export class PlatformAdminOverviewResponseDto {
  generatedAt!: string;
  organizations!: PlatformAdminStatusCountersDto;
  schools!: PlatformAdminStatusCountersDto;
  deferred!: PlatformAdminDeferredDto;
}

export class PlatformAdminStatusCountersDto {
  total!: number;
  active!: number;
  suspended!: number;
  archived!: number;
}

export class PlatformAdminEntitlementCountersDto {
  total!: number;
  active!: number;
  trial!: number;
  suspended!: number;
  expired!: number;
  archived!: number;
  schoolsOverSeatLimit!: number;
}

export class PlatformAdminDeferredDto {
  schoolProvisioning!: 'available';
  entitlements!: 'available';
  featureControl!: 'deferred';
  billing!: 'out_of_scope_v1';
  advancedAnalytics!: 'deferred';
}

export class PlatformAdminOverviewResponseDto {
  generatedAt!: string;
  organizations!: PlatformAdminStatusCountersDto;
  schools!: PlatformAdminStatusCountersDto;
  entitlements!: PlatformAdminEntitlementCountersDto;
  deferred!: PlatformAdminDeferredDto;
}

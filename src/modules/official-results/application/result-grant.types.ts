import type { ResultGrantAction } from '@prisma/client';

export interface ResultGrantInput {
  grantee: { kind: 'USER' | 'ROLE'; id: string };
  scope: {
    reportingPeriodIds: string[];
    groupIds: string[];
    classroomIds: string[];
    fieldIds?: string[];
  };
  actions: ResultGrantAction[];
  reason: string;
  startsAt?: string;
  expiresAt?: string;
}

export interface ResultCorrectionWindowInput {
  expectedPeriodRevision: number;
  expiresAt: string;
  reason: string;
  targets: {
    slotId: string;
    releaseUnitId: string;
    authorizedActorIds: string[];
  }[];
}

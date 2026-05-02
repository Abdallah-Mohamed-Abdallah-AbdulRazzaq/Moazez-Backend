import { CommunicationUserBlockRecord } from '../infrastructure/communication-block.repository';
import { sanitizeSafetyMetadata } from './communication-report.presenter';

export interface CommunicationUserBlockResponse {
  id: string;
  blockerUserId: string;
  blockedUserId: string;
  targetUserId: string;
  reason: string | null;
  status: string;
  unblockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
}

export function presentCommunicationUserBlockList(
  blocks: CommunicationUserBlockRecord[],
) {
  return {
    items: blocks.map((block) => presentCommunicationUserBlock(block)),
  };
}

export function presentCommunicationUserBlock(
  block: CommunicationUserBlockRecord,
): CommunicationUserBlockResponse {
  return {
    id: block.id,
    blockerUserId: block.blockerUserId,
    blockedUserId: block.blockedUserId,
    targetUserId: block.blockedUserId,
    reason: block.reason,
    status: block.unblockedAt ? 'inactive' : 'active',
    unblockedAt: presentNullableDate(block.unblockedAt),
    createdAt: block.createdAt.toISOString(),
    updatedAt: block.updatedAt.toISOString(),
    metadata: sanitizeSafetyMetadata(block.metadata),
  };
}

export function summarizeCommunicationUserBlockForAudit(
  block: CommunicationUserBlockRecord,
): Record<string, unknown> {
  return {
    id: block.id,
    blockerUserId: block.blockerUserId,
    blockedUserId: block.blockedUserId,
    status: block.unblockedAt ? 'inactive' : 'active',
    hasReason: Boolean(block.reason),
    unblockedAt: presentNullableDate(block.unblockedAt),
    createdAt: block.createdAt.toISOString(),
    updatedAt: block.updatedAt.toISOString(),
  };
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

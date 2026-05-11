import { BulkCredentialSelectionDto } from '../dto/credential.dto';
import {
  CredentialMembershipRecord,
  isDisabledCredentialTarget,
} from '../infrastructure/user-credentials.repository';

export interface CredentialTargetPartition {
  totalMatched: number;
  eligible: CredentialMembershipRecord[];
  skipped: Array<{ membership: CredentialMembershipRecord; reason: string }>;
  skippedReasons: Record<string, number>;
}

export function partitionCredentialTargets(
  targets: CredentialMembershipRecord[],
  selection: BulkCredentialSelectionDto,
): CredentialTargetPartition {
  const includeUsersWithPassword = selection.includeUsersWithPassword === true;
  const includeDisabledUsers = selection.includeDisabledUsers === true;
  const eligible: CredentialMembershipRecord[] = [];
  const skipped: Array<{
    membership: CredentialMembershipRecord;
    reason: string;
  }> = [];
  const skippedReasons: Record<string, number> = {};

  for (const membership of targets) {
    const reason = skipReason(membership, {
      includeUsersWithPassword,
      includeDisabledUsers,
    });

    if (reason) {
      skipped.push({ membership, reason });
      skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
      continue;
    }

    eligible.push(membership);
  }

  return {
    totalMatched: targets.length,
    eligible,
    skipped,
    skippedReasons,
  };
}

function skipReason(
  membership: CredentialMembershipRecord,
  options: {
    includeUsersWithPassword: boolean;
    includeDisabledUsers: boolean;
  },
): string | null {
  if (
    !options.includeDisabledUsers &&
    isDisabledCredentialTarget(membership.user.status)
  ) {
    return 'disabled_user';
  }

  if (!options.includeUsersWithPassword && membership.user.passwordHash) {
    return 'already_has_password';
  }

  return null;
}

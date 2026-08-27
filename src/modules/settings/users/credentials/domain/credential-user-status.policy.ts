import { UserStatus } from '@prisma/client';

export function isCredentialManageableStatus(status: UserStatus): boolean {
  return status === UserStatus.ACTIVE || status === UserStatus.INVITED;
}

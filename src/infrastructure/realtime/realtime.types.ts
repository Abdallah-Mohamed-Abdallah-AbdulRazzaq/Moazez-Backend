import type { UserType } from '@prisma/client';
import type { Socket } from 'socket.io';

export interface RealtimeAuthenticatedContext {
  actorId: string;
  userType: UserType;
  schoolId: string;
  organizationId: string;
  roleId: string;
  permissions: string[];
  sessionId: string;
}

export type RealtimeSocketData = Partial<RealtimeAuthenticatedContext>;

export type RealtimeSocket = Socket & {
  data: RealtimeSocketData;
};

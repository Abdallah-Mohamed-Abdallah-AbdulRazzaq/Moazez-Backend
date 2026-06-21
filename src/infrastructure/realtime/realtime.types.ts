import type { UserType } from '@prisma/client';
import type { Socket } from 'socket.io';
import type { RealtimeActorCard } from './realtime-actor-card';

export interface RealtimeAuthenticatedContext {
  actorId: string;
  userType: UserType;
  membershipId: string;
  schoolId: string;
  organizationId: string;
  roleId: string;
  permissions: string[];
  sessionId: string;
  actor: RealtimeActorCard;
}

export type RealtimeSocketData = Partial<RealtimeAuthenticatedContext>;

export type RealtimeSocket = Socket & {
  data: RealtimeSocketData;
};

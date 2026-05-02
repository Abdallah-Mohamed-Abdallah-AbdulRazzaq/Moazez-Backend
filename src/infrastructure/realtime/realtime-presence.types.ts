export type RealtimePresenceStatus = 'online' | 'offline';

export interface RealtimePresenceEventPayload {
  userId: string;
  status: RealtimePresenceStatus;
  online: boolean;
  updatedAt: string;
}

export interface RealtimePresenceSnapshotItem {
  userId: string;
  online: true;
  updatedAt: string;
}

export interface RealtimePresenceStoreResult {
  socketCount: number;
  updatedAt: string;
  transitionedOnline: boolean;
  transitionedOffline: boolean;
}

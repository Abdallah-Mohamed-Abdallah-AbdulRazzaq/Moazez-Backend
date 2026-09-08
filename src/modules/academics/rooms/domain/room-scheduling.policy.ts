export interface SchedulingRoom {
  id: string;
  isActive: boolean;
  capacity: number | null;
}

export interface SchedulingClassroom {
  id: string;
  capacity: number | null;
}

export type RoomSchedulingEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reason: 'room_not_found' | 'room_inactive' | 'room_capacity_insufficient';
    };

export class RoomSchedulingPolicy {
  static isRoomSchedulable(room: SchedulingRoom): boolean {
    return room.isActive;
  }

  static isRoomCapacityCompatible(
    room: Pick<SchedulingRoom, 'capacity'>,
    classroom: Pick<SchedulingClassroom, 'capacity'>,
  ): boolean {
    return (
      room.capacity === null ||
      classroom.capacity === null ||
      room.capacity >= classroom.capacity
    );
  }

  static evaluate(
    room: SchedulingRoom | null,
    classroom: SchedulingClassroom,
  ): RoomSchedulingEligibility {
    if (!room) {
      return { eligible: false, reason: 'room_not_found' };
    }
    if (!this.isRoomSchedulable(room)) {
      return { eligible: false, reason: 'room_inactive' };
    }
    if (!this.isRoomCapacityCompatible(room, classroom)) {
      return { eligible: false, reason: 'room_capacity_insufficient' };
    }
    return { eligible: true };
  }
}

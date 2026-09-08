import {
  RoomSchedulingEligibility,
  RoomSchedulingPolicy,
  SchedulingClassroom,
  SchedulingRoom,
} from '../../rooms/domain/room-scheduling.policy';
import {
  TimetableRoomCapacityInsufficientException,
  TimetableRoomInactiveException,
  TimetableRoomNotFoundException,
} from './timetable.exceptions';

export function evaluateTimetableRoomScheduling(
  room: SchedulingRoom | null,
  classroom: SchedulingClassroom,
): RoomSchedulingEligibility {
  return RoomSchedulingPolicy.evaluate(room, classroom);
}

export function assertTimetableRoomScheduling(
  room: SchedulingRoom | null,
  classroom: SchedulingClassroom,
  extraDetails: Record<string, unknown> = {},
): asserts room is SchedulingRoom {
  const result = evaluateTimetableRoomScheduling(room, classroom);
  if (result.eligible) return;

  if (result.reason === 'room_not_found') {
    throw new TimetableRoomNotFoundException({
      ...extraDetails,
      roomId: room?.id ?? extraDetails.roomId,
    });
  }
  if (result.reason === 'room_inactive') {
    throw new TimetableRoomInactiveException({
      ...extraDetails,
      roomId: room!.id,
    });
  }
  throw new TimetableRoomCapacityInsufficientException({
    ...extraDetails,
    roomId: room!.id,
    roomCapacity: room!.capacity,
    classroomId: classroom.id,
    classroomCapacity: classroom.capacity,
  });
}

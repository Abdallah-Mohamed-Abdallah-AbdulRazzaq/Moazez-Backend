import { RoomSchedulingPolicy } from '../domain/room-scheduling.policy';

describe('RoomSchedulingPolicy', () => {
  const classroom = (capacity: number | null) => ({
    id: 'classroom-1',
    capacity,
  });
  const room = (capacity: number | null, isActive = true) => ({
    id: 'room-1',
    capacity,
    isActive,
  });

  it.each([
    [null, null],
    [null, 30],
    [30, null],
    [30, 30],
    [40, 30],
  ])(
    'accepts active room capacity %s for classroom capacity %s',
    (roomCapacity, classroomCapacity) => {
      expect(
        RoomSchedulingPolicy.evaluate(
          room(roomCapacity),
          classroom(classroomCapacity),
        ),
      ).toEqual({ eligible: true });
    },
  );

  it('rejects a known undersized room', () => {
    expect(RoomSchedulingPolicy.evaluate(room(20), classroom(30))).toEqual({
      eligible: false,
      reason: 'room_capacity_insufficient',
    });
  });

  it('rejects an inactive room before considering capacity', () => {
    expect(
      RoomSchedulingPolicy.evaluate(room(40, false), classroom(30)),
    ).toEqual({ eligible: false, reason: 'room_inactive' });
  });

  it('reports a missing tenant-scoped room as not found', () => {
    expect(RoomSchedulingPolicy.evaluate(null, classroom(30))).toEqual({
      eligible: false,
      reason: 'room_not_found',
    });
  });
});

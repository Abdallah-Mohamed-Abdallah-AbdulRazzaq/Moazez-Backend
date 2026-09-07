import { findTimetableIntervalConflicts } from '../domain/timetable-conflicts';
import { timetableTimeRangesOverlap } from '../domain/timetable-time';

type Source = Parameters<typeof findTimetableIntervalConflicts>[0][number];

describe('timetable interval conflicts', () => {
  it.each([
    ['adjacent', [480, 540], [540, 600], false],
    ['partial overlap from the left', [480, 550], [540, 600], true],
    ['partial overlap from the right', [540, 600], [480, 550], true],
    ['contains the second range', [480, 620], [500, 600], true],
    ['is contained by the second range', [500, 600], [480, 620], true],
    ['is identical', [480, 540], [480, 540], true],
  ])('%s', (_label, first, second, expected) => {
    expect(
      timetableTimeRangesOverlap(
        { startMinute: first[0], endMinute: first[1] },
        { startMinute: second[0], endMinute: second[1] },
      ),
    ).toBe(expected);
  });

  it('detects a classroom partial overlap across different period ids', () => {
    expect(
      findTimetableIntervalConflicts([
        source({ identity: 'a', periodId: 'period-a', endTime: '09:10' }),
        source({
          identity: 'b',
          periodId: 'period-b',
          startTime: '09:00',
          endTime: '09:45',
          teacherUserId: 'teacher-b',
        }),
      ]).map((conflict) => conflict.kind),
    ).toEqual(['classroom']);
  });

  it('allows adjacent classroom intervals', () => {
    expect(
      findTimetableIntervalConflicts([
        source({ identity: 'a', endTime: '09:00' }),
        source({
          identity: 'b',
          startTime: '09:00',
          endTime: '09:45',
        }),
      ]),
    ).toEqual([]);
  });

  it('detects a teacher partial overlap across classrooms and configs', () => {
    expect(
      findTimetableIntervalConflicts([
        source({ identity: 'a', endTime: '09:10' }),
        source({
          identity: 'b',
          timetableConfigId: 'config-b',
          classroomId: 'classroom-b',
          periodId: 'period-b',
          startTime: '09:00',
          endTime: '09:45',
        }),
      ]).map((conflict) => conflict.kind),
    ).toEqual(['teacher']);
  });

  it('detects a non-null room partial overlap across configs', () => {
    expect(
      findTimetableIntervalConflicts([
        source({ identity: 'a', roomId: 'room-1', endTime: '09:10' }),
        source({
          identity: 'b',
          timetableConfigId: 'config-b',
          classroomId: 'classroom-b',
          teacherUserId: 'teacher-b',
          roomId: 'room-1',
          startTime: '09:00',
          endTime: '09:45',
        }),
      ]).map((conflict) => conflict.kind),
    ).toEqual(['room']);
  });

  it('does not conflict null rooms', () => {
    expect(
      findTimetableIntervalConflicts([
        source({ identity: 'a' }),
        source({
          identity: 'b',
          classroomId: 'classroom-b',
          teacherUserId: 'teacher-b',
        }),
      ]),
    ).toEqual([]);
  });

  it('emits the three unique teacher pairs for three simultaneous entries', () => {
    const conflicts = findTimetableIntervalConflicts([
      source({ identity: 'a', classroomId: 'classroom-a' }),
      source({ identity: 'b', classroomId: 'classroom-b' }),
      source({ identity: 'c', classroomId: 'classroom-c' }),
    ]);

    expect(conflicts).toHaveLength(3);
    expect(
      conflicts.map(
        (conflict) => `${conflict.first.identity}:${conflict.second.identity}`,
      ),
    ).toEqual(['a:b', 'a:c', 'b:c']);
  });

  it.each([
    ['different day', { dayOfWeek: 2 }],
    ['different term', { termId: 'term-2' }],
    ['different school', { schoolId: 'school-2' }],
  ])('does not conflict on a %s', (_label, overrides) => {
    expect(
      findTimetableIntervalConflicts([
        source({ identity: 'a' }),
        source({ identity: 'b', ...overrides }),
      ]),
    ).toEqual([]);
  });
});

function source(overrides: Partial<Source>): Source {
  return {
    identity: 'source',
    schoolId: 'school-1',
    termId: 'term-1',
    timetableConfigId: 'config-a',
    entryId: null,
    proposedIndex: null,
    classroomId: 'classroom-a',
    teacherUserId: 'teacher-a',
    roomId: null,
    dayOfWeek: 1,
    periodId: 'period-a',
    startTime: '08:30',
    endTime: '09:00',
    ...overrides,
  };
}

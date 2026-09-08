import {
  TimetableConfigStatus,
  TimetableEntryStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { CreateRoomUseCase } from '../application/create-room.use-case';
import { DeleteRoomUseCase } from '../application/delete-room.use-case';
import { ListRoomsUseCase } from '../application/list-rooms.use-case';
import { UpdateRoomUseCase } from '../application/update-room.use-case';
import { RoomsRepository } from '../infrastructure/rooms.repository';

type RoomStoreItem = {
  id: string;
  schoolId: string;
  nameAr: string;
  nameEn: string;
  capacity: number | null;
  floor: string | null;
  building: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

describe('Rooms use cases', () => {
  async function withScope(testFn: () => Promise<void>): Promise<void> {
    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['academics.structure.view', 'academics.structure.manage'],
      });

      await testFn();
    });
  }

  function createRepository(seed: RoomStoreItem[] = []): RoomsRepository {
    const store = [...seed];

    return {
      listRooms: jest
        .fn()
        .mockImplementation(async () =>
          store
            .filter((room) => room.deletedAt === null)
            .sort((left, right) => left.nameEn.localeCompare(right.nameEn)),
        ),
      findRoomById: jest
        .fn()
        .mockImplementation(
          async (roomId: string) =>
            store.find(
              (room) => room.id === roomId && room.deletedAt === null,
            ) ?? null,
        ),
      createRoom: jest.fn().mockImplementation(async (data) => {
        const room: RoomStoreItem = {
          id: `room-${store.length + 1}`,
          schoolId: String(data.schoolId),
          nameAr: String(data.nameAr),
          nameEn: String(data.nameEn),
          capacity: (data.capacity as number | null | undefined) ?? null,
          floor: (data.floor as string | null | undefined) ?? null,
          building: (data.building as string | null | undefined) ?? null,
          isActive: Boolean(data.isActive),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        store.push(room);
        return room;
      }),
      updateRoomWithSchedulingIntegrity: jest
        .fn()
        .mockImplementation(async (roomId: string, data) => {
          const room = store.find(
            (item) => item.id === roomId && item.deletedAt === null,
          );
          if (!room) {
            return { status: 'not_found' as const };
          }

          Object.assign(room, data, { updatedAt: new Date() });
          return { status: 'updated' as const, room };
        }),
      softDeleteRoom: jest.fn().mockImplementation(async (roomId: string) => {
        const room = store.find(
          (item) => item.id === roomId && item.deletedAt === null,
        );
        if (!room) {
          return { status: 'not_found' as const };
        }

        room.deletedAt = new Date();
        room.updatedAt = new Date();
        return { status: 'deleted' as const };
      }),
    } as unknown as RoomsRepository;
  }

  function seedRoom(overrides: Partial<RoomStoreItem> = {}): RoomStoreItem {
    return {
      id: 'room-1',
      schoolId: 'school-1',
      nameAr: 'Room 1',
      nameEn: 'Room 1',
      capacity: 40,
      floor: null,
      building: null,
      isActive: true,
      createdAt: new Date('2026-09-08T10:00:00.000Z'),
      updatedAt: new Date('2026-09-08T10:00:00.000Z'),
      deletedAt: null,
      ...overrides,
    };
  }

  function createInfrastructureRepository(input?: {
    room?: RoomStoreItem | null;
    entries?: Array<{
      status: TimetableEntryStatus;
      termActive: boolean;
      configStatus: TimetableConfigStatus;
      classroom: { id: string; capacity: number | null };
    }>;
    defaultClassrooms?: Array<{ id: string; capacity: number | null }>;
  }): {
    repository: RoomsRepository;
    tx: {
      room: { findFirst: jest.Mock; update: jest.Mock };
      timetableEntry: { count: jest.Mock; findMany: jest.Mock };
      classroom: { count: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    };
  } {
    const room = input?.room === undefined ? seedRoom() : input.room;
    const entries = input?.entries ?? [];
    const defaultClassrooms = input?.defaultClassrooms ?? [];
    const liveEntries = entries.filter(
      (entry) =>
        entry.status !== TimetableEntryStatus.CANCELLED &&
        entry.termActive &&
        entry.configStatus !== TimetableConfigStatus.ARCHIVED,
    );
    const tx = {
      room: {
        findFirst: jest.fn().mockResolvedValue(room),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          ...room!,
          ...data,
          updatedAt: new Date('2026-09-08T11:00:00.000Z'),
        })),
      },
      timetableEntry: {
        count: jest.fn().mockResolvedValue(liveEntries.length),
        findMany: jest
          .fn()
          .mockResolvedValue(
            liveEntries.map((entry) => ({ classroom: entry.classroom })),
          ),
      },
      classroom: {
        count: jest.fn().mockResolvedValue(defaultClassrooms.length),
        findMany: jest.fn().mockResolvedValue(defaultClassrooms),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(tx)),
    };
    return {
      repository: new RoomsRepository(prisma as never),
      tx,
    };
  }

  it('supports create, list, update, and soft delete flow', async () => {
    const repository = createRepository();
    const createRoomUseCase = new CreateRoomUseCase(repository);
    const listRoomsUseCase = new ListRoomsUseCase(repository);
    const updateRoomUseCase = new UpdateRoomUseCase(repository);
    const deleteRoomUseCase = new DeleteRoomUseCase(repository);

    await withScope(async () => {
      const created = await createRoomUseCase.execute({
        nameEn: 'Lab 101',
        nameAr: 'Lab 101',
        capacity: 24,
        floor: '1',
        building: 'Science',
        isActive: true,
      });

      expect(created.capacity).toBe(24);

      const listed = await listRoomsUseCase.execute();
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0].nameEn).toBe('Lab 101');

      const updated = await updateRoomUseCase.execute(created.id, {
        nameEn: 'Physics Lab 101',
        floor: '2',
        isActive: false,
      });

      expect(updated.nameEn).toBe('Physics Lab 101');
      expect(updated.floor).toBe('2');
      expect(updated.isActive).toBe(false);

      const afterDeactivate = await listRoomsUseCase.execute();
      expect(afterDeactivate.items).toEqual([
        expect.objectContaining({ id: created.id, isActive: false }),
      ]);

      await expect(deleteRoomUseCase.execute(created.id)).resolves.toEqual({
        ok: true,
      });

      const afterDelete = await listRoomsUseCase.execute();
      expect(afterDelete.items).toHaveLength(0);
    });
  });

  it('blocks room lifecycle changes with bounded scheduling dependency errors', async () => {
    const repository = createRepository([seedRoom()]);
    const details = {
      reason: 'room_deactivation' as const,
      roomId: 'room-1',
      activeTimetableEntryCount: 1,
      classroomDefaultRoomCount: 0,
    };
    jest
      .mocked(repository.updateRoomWithSchedulingIntegrity)
      .mockResolvedValueOnce({ status: 'dependency', details });
    jest.mocked(repository.softDeleteRoom).mockResolvedValueOnce({
      status: 'dependency',
      details: { ...details, reason: 'room_delete' },
    });

    await withScope(async () => {
      await expect(
        new UpdateRoomUseCase(repository).execute('room-1', {
          isActive: false,
        }),
      ).rejects.toMatchObject({
        code: 'academics.rooms.scheduling_dependency',
        httpStatus: 409,
        details,
      });
      await expect(
        new DeleteRoomUseCase(repository).execute('room-1'),
      ).rejects.toMatchObject({
        code: 'academics.rooms.scheduling_dependency',
        httpStatus: 409,
        details: { reason: 'room_delete' },
      });
    });
  });

  it('uses tenant-scoped live timetable and default-room dependency filters', async () => {
    const { repository, tx } = createInfrastructureRepository({
      entries: [
        {
          status: TimetableEntryStatus.DRAFT,
          termActive: true,
          configStatus: TimetableConfigStatus.DRAFT,
          classroom: { id: 'classroom-1', capacity: 30 },
        },
      ],
    });

    await withScope(async () => {
      await expect(
        repository.updateRoomWithSchedulingIntegrity(
          'room-1',
          { isActive: false },
          { isActive: false },
        ),
      ).resolves.toMatchObject({
        status: 'dependency',
        details: {
          activeTimetableEntryCount: 1,
          classroomDefaultRoomCount: 0,
        },
      });
    });

    expect(tx.timetableEntry.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        schoolId: 'school-1',
        roomId: 'room-1',
        status: { not: TimetableEntryStatus.CANCELLED },
        term: {
          is: { schoolId: 'school-1', isActive: true, deletedAt: null },
        },
        timetableConfig: {
          is: {
            schoolId: 'school-1',
            status: { not: TimetableConfigStatus.ARCHIVED },
          },
        },
      }),
    });
    expect(tx.classroom.count).toHaveBeenCalledWith({
      where: {
        schoolId: 'school-1',
        roomId: 'room-1',
        deletedAt: null,
      },
    });
  });

  it('does not let cancelled or historical timetable entries block deactivation', async () => {
    const entries = [
      {
        status: TimetableEntryStatus.CANCELLED,
        termActive: true,
        configStatus: TimetableConfigStatus.DRAFT,
        classroom: { id: 'classroom-cancelled', capacity: 30 },
      },
      {
        status: TimetableEntryStatus.DRAFT,
        termActive: false,
        configStatus: TimetableConfigStatus.DRAFT,
        classroom: { id: 'classroom-closed', capacity: 30 },
      },
      {
        status: TimetableEntryStatus.ACTIVE,
        termActive: true,
        configStatus: TimetableConfigStatus.ARCHIVED,
        classroom: { id: 'classroom-archived', capacity: 30 },
      },
    ];
    const { repository, tx } = createInfrastructureRepository({ entries });

    await withScope(async () => {
      await expect(
        repository.updateRoomWithSchedulingIntegrity(
          'room-1',
          { isActive: false },
          { isActive: false },
        ),
      ).resolves.toMatchObject({ status: 'updated' });
    });
    expect(tx.room.update).toHaveBeenCalledTimes(1);
  });

  it('blocks a non-deleted Classroom.roomId dependency', async () => {
    const { repository } = createInfrastructureRepository({
      defaultClassrooms: [{ id: 'classroom-default', capacity: 30 }],
    });

    await withScope(async () => {
      await expect(
        repository.updateRoomWithSchedulingIntegrity(
          'room-1',
          { isActive: false },
          { isActive: false },
        ),
      ).resolves.toMatchObject({
        status: 'dependency',
        details: { classroomDefaultRoomCount: 1 },
      });
    });
  });

  it.each([
    [35, 30, false],
    [30, 30, false],
    [29, 30, true],
    [10, null, false],
    [null, 30, false],
    [50, 30, false],
  ])(
    'guards capacity change to %s against dependent classroom capacity %s',
    async (proposedCapacity, classroomCapacity, blocked) => {
      const { repository, tx } = createInfrastructureRepository({
        entries: [
          {
            status: TimetableEntryStatus.DRAFT,
            termActive: true,
            configStatus: TimetableConfigStatus.DRAFT,
            classroom: { id: 'classroom-1', capacity: classroomCapacity },
          },
        ],
      });

      await withScope(async () => {
        const result = await repository.updateRoomWithSchedulingIntegrity(
          'room-1',
          { capacity: proposedCapacity },
          { capacity: proposedCapacity },
        );
        if (blocked) {
          expect(result).toMatchObject({
            status: 'dependency',
            details: {
              reason: 'capacity_insufficient',
              incompatibleClassroomCount: 1,
              proposedRoomCapacity: proposedCapacity,
            },
          });
          expect(tx.room.update).not.toHaveBeenCalled();
        } else {
          expect(result).toMatchObject({ status: 'updated' });
          expect(tx.room.update).toHaveBeenCalledTimes(1);
        }
      });
    },
  );

  it('guards capacity reduction for a legacy default-room classroom', async () => {
    const { repository } = createInfrastructureRepository({
      defaultClassrooms: [{ id: 'classroom-default', capacity: 30 }],
    });

    await withScope(async () => {
      await expect(
        repository.updateRoomWithSchedulingIntegrity(
          'room-1',
          { capacity: 29 },
          { capacity: 29 },
        ),
      ).resolves.toMatchObject({
        status: 'dependency',
        details: {
          reason: 'capacity_insufficient',
          classroomDefaultRoomCount: 1,
          incompatibleClassroomCount: 1,
        },
      });
    });
  });

  it('blocks live deletes, allows historical-only deletes, and never cascades', async () => {
    const live = createInfrastructureRepository({
      entries: [
        {
          status: TimetableEntryStatus.ACTIVE,
          termActive: true,
          configStatus: TimetableConfigStatus.ACTIVE,
          classroom: { id: 'classroom-1', capacity: 30 },
        },
      ],
    });
    const historical = createInfrastructureRepository({
      entries: [
        {
          status: TimetableEntryStatus.ACTIVE,
          termActive: false,
          configStatus: TimetableConfigStatus.ARCHIVED,
          classroom: { id: 'classroom-1', capacity: 30 },
        },
      ],
    });
    const defaultRoom = createInfrastructureRepository({
      defaultClassrooms: [{ id: 'classroom-default', capacity: 30 }],
    });

    await withScope(async () => {
      await expect(
        live.repository.softDeleteRoom('room-1'),
      ).resolves.toMatchObject({ status: 'dependency' });
      await expect(
        historical.repository.softDeleteRoom('room-1'),
      ).resolves.toEqual({ status: 'deleted' });
      await expect(
        defaultRoom.repository.softDeleteRoom('room-1'),
      ).resolves.toMatchObject({
        status: 'dependency',
        details: { classroomDefaultRoomCount: 1 },
      });
    });
    expect(live.tx.room.update).not.toHaveBeenCalled();
    expect(historical.tx.room.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
    expect(historical.tx.classroom.update).not.toHaveBeenCalled();
  });

  it('masks a foreign room before running tenant dependency queries', async () => {
    const { repository, tx } = createInfrastructureRepository({ room: null });

    await withScope(async () => {
      await expect(
        repository.updateRoomWithSchedulingIntegrity(
          'foreign-room',
          { isActive: false },
          { isActive: false },
        ),
      ).resolves.toEqual({ status: 'not_found' });
      await expect(repository.softDeleteRoom('foreign-room')).resolves.toEqual({
        status: 'not_found',
      });
    });
    expect(tx.room.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'foreign-room',
          schoolId: 'school-1',
          deletedAt: null,
        },
      }),
    );
    expect(tx.timetableEntry.count).not.toHaveBeenCalled();
    expect(tx.classroom.count).not.toHaveBeenCalled();
  });
});

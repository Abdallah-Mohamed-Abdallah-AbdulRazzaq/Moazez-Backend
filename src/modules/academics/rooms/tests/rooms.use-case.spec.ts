import { UserType } from '@prisma/client';
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
      listRooms: jest.fn().mockImplementation(async () =>
        store
          .filter((room) => room.deletedAt === null)
          .sort((left, right) => left.nameEn.localeCompare(right.nameEn)),
      ),
      findRoomById: jest.fn().mockImplementation(async (roomId: string) =>
        store.find((room) => room.id === roomId && room.deletedAt === null) ??
        null,
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
      updateRoom: jest.fn().mockImplementation(async (roomId: string, data) => {
        const room = store.find((item) => item.id === roomId && item.deletedAt === null);
        if (!room) {
          throw new Error('Room not found');
        }

        Object.assign(room, data, { updatedAt: new Date() });
        return room;
      }),
      softDeleteRoom: jest.fn().mockImplementation(async (roomId: string) => {
        const room = store.find((item) => item.id === roomId && item.deletedAt === null);
        if (!room) {
          return { status: 'not_found' as const };
        }

        room.deletedAt = new Date();
        room.updatedAt = new Date();
        return { status: 'deleted' as const };
      }),
    } as unknown as RoomsRepository;
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

      await expect(deleteRoomUseCase.execute(created.id)).resolves.toEqual({
        ok: true,
      });

      const afterDelete = await listRoomsUseCase.execute();
      expect(afterDelete.items).toHaveLength(0);
    });
  });
});

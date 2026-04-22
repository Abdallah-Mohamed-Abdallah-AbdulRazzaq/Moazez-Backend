import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ROOM_ARGS = Prisma.validator<Prisma.RoomDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
    capacity: true,
    floor: true,
    building: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  },
});

export type RoomRecord = Prisma.RoomGetPayload<typeof ROOM_ARGS>;

export type SoftDeleteRoomResult =
  | { status: 'deleted' }
  | { status: 'not_found' };

@Injectable()
export class RoomsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error('RoomsRepository requires an active school membership');
    }

    return schoolId;
  }

  listRooms(): Promise<RoomRecord[]> {
    return this.scopedPrisma.room.findMany({
      orderBy: [{ nameEn: 'asc' }, { nameAr: 'asc' }],
      ...ROOM_ARGS,
    });
  }

  findRoomById(roomId: string): Promise<RoomRecord | null> {
    return this.scopedPrisma.room.findFirst({
      where: { id: roomId },
      ...ROOM_ARGS,
    });
  }

  createRoom(data: Prisma.RoomUncheckedCreateInput): Promise<RoomRecord> {
    return this.scopedPrisma.room.create({
      data,
      ...ROOM_ARGS,
    });
  }

  updateRoom(
    roomId: string,
    data: Prisma.RoomUncheckedUpdateInput,
  ): Promise<RoomRecord> {
    return this.prisma.room.update({
      where: {
        id_schoolId: {
          id: roomId,
          schoolId: this.getCurrentSchoolId(),
        },
      },
      data,
      ...ROOM_ARGS,
    });
  }

  softDeleteRoom(roomId: string): Promise<SoftDeleteRoomResult> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: { id: roomId, schoolId, deletedAt: null },
        ...ROOM_ARGS,
      });
      if (!room) {
        return { status: 'not_found' } as SoftDeleteRoomResult;
      }

      await tx.room.update({
        where: {
          id_schoolId: {
            id: roomId,
            schoolId,
          },
        },
        data: { deletedAt: new Date() },
      });

      return { status: 'deleted' } as SoftDeleteRoomResult;
    });
  }
}

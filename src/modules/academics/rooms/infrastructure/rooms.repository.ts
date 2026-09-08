import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TimetableConfigStatus,
  TimetableEntryStatus,
} from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RoomSchedulingPolicy } from '../domain/room-scheduling.policy';

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

export type RoomSchedulingDependencyDetails = {
  reason: 'room_deactivation' | 'room_delete' | 'capacity_insufficient';
  roomId: string;
  activeTimetableEntryCount: number;
  classroomDefaultRoomCount: number;
  incompatibleClassroomCount?: number;
  proposedRoomCapacity?: number;
};

export type UpdateRoomResult =
  | { status: 'updated'; room: RoomRecord }
  | { status: 'not_found' }
  | { status: 'dependency'; details: RoomSchedulingDependencyDetails };

export type SoftDeleteRoomResult =
  | { status: 'deleted' }
  | { status: 'not_found' }
  | { status: 'dependency'; details: RoomSchedulingDependencyDetails };

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

  updateRoomWithSchedulingIntegrity(
    roomId: string,
    data: Prisma.RoomUncheckedUpdateInput,
    requested: { isActive?: boolean; capacity?: number | null },
  ): Promise<UpdateRoomResult> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: { id: roomId, schoolId, deletedAt: null },
        ...ROOM_ARGS,
      });
      if (!room) return { status: 'not_found' } as UpdateRoomResult;

      const isDeactivation = room.isActive && requested.isActive === false;
      const tightensCapacity =
        requested.capacity !== undefined &&
        requested.capacity !== null &&
        (room.capacity === null || requested.capacity < room.capacity);

      if (isDeactivation || tightensCapacity) {
        const dependencies = await loadRoomSchedulingDependencies(
          tx,
          schoolId,
          roomId,
          tightensCapacity,
        );
        if (
          isDeactivation &&
          (dependencies.activeTimetableEntryCount > 0 ||
            dependencies.classroomDefaultRoomCount > 0)
        ) {
          return {
            status: 'dependency',
            details: dependencyDetails(
              'room_deactivation',
              roomId,
              dependencies,
            ),
          } as UpdateRoomResult;
        }

        if (tightensCapacity) {
          const incompatibleClassroomCount = Array.from(
            dependencies.classrooms.values(),
          ).filter(
            (classroom) =>
              !RoomSchedulingPolicy.isRoomCapacityCompatible(
                { capacity: requested.capacity! },
                classroom,
              ),
          ).length;
          if (incompatibleClassroomCount > 0) {
            return {
              status: 'dependency',
              details: {
                ...dependencyDetails(
                  'capacity_insufficient',
                  roomId,
                  dependencies,
                ),
                incompatibleClassroomCount,
                proposedRoomCapacity: requested.capacity!,
              },
            } as UpdateRoomResult;
          }
        }
      }

      const updated = await tx.room.update({
        where: { id_schoolId: { id: roomId, schoolId } },
        data,
        ...ROOM_ARGS,
      });
      return { status: 'updated', room: updated } as UpdateRoomResult;
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

      const dependencies = await loadRoomSchedulingDependencies(
        tx,
        schoolId,
        roomId,
        false,
      );
      if (
        dependencies.activeTimetableEntryCount > 0 ||
        dependencies.classroomDefaultRoomCount > 0
      ) {
        return {
          status: 'dependency',
          details: dependencyDetails('room_delete', roomId, dependencies),
        } as SoftDeleteRoomResult;
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

type RoomSchedulingDependencies = {
  activeTimetableEntryCount: number;
  classroomDefaultRoomCount: number;
  classrooms: Map<string, { id: string; capacity: number | null }>;
};

async function loadRoomSchedulingDependencies(
  tx: Prisma.TransactionClient,
  schoolId: string,
  roomId: string,
  includeClassrooms: boolean,
): Promise<RoomSchedulingDependencies> {
  const liveEntryWhere: Prisma.TimetableEntryWhereInput = {
    schoolId,
    roomId,
    status: { not: TimetableEntryStatus.CANCELLED },
    term: { is: { schoolId, isActive: true, deletedAt: null } },
    timetableConfig: {
      is: { schoolId, status: { not: TimetableConfigStatus.ARCHIVED } },
    },
  };
  const defaultClassroomWhere: Prisma.ClassroomWhereInput = {
    schoolId,
    roomId,
    deletedAt: null,
  };
  const activeTimetableEntryCount = await tx.timetableEntry.count({
    where: liveEntryWhere,
  });
  const classroomDefaultRoomCount = await tx.classroom.count({
    where: defaultClassroomWhere,
  });
  const classrooms = new Map<string, { id: string; capacity: number | null }>();

  if (includeClassrooms) {
    const liveClassrooms = await tx.timetableEntry.findMany({
      where: liveEntryWhere,
      distinct: ['classroomId'],
      select: { classroom: { select: { id: true, capacity: true } } },
    });
    const defaultClassrooms = await tx.classroom.findMany({
      where: defaultClassroomWhere,
      select: { id: true, capacity: true },
    });
    for (const entry of liveClassrooms) {
      classrooms.set(entry.classroom.id, entry.classroom);
    }
    for (const classroom of defaultClassrooms) {
      classrooms.set(classroom.id, classroom);
    }
  }

  return {
    activeTimetableEntryCount,
    classroomDefaultRoomCount,
    classrooms,
  };
}

function dependencyDetails(
  reason: RoomSchedulingDependencyDetails['reason'],
  roomId: string,
  dependencies: RoomSchedulingDependencies,
): RoomSchedulingDependencyDetails {
  return {
    reason,
    roomId,
    activeTimetableEntryCount: dependencies.activeTimetableEntryCount,
    classroomDefaultRoomCount: dependencies.classroomDefaultRoomCount,
  };
}

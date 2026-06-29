import { Injectable } from '@nestjs/common';
import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';

const STUDENT_AVATAR_FILE_ARGS = Prisma.validator<Prisma.FileDefaultArgs>()({
  select: {
    id: true,
    mimeType: true,
    sizeBytes: true,
    deletedAt: true,
  },
});

const STUDENT_AVATAR_STATE_ARGS =
  Prisma.validator<Prisma.StudentDefaultArgs>()({
    select: {
      id: true,
      avatarFileId: true,
      avatarFile: STUDENT_AVATAR_FILE_ARGS,
    },
  });

export type StudentAvatarStateRecord = Prisma.StudentGetPayload<
  typeof STUDENT_AVATAR_STATE_ARGS
>;

@Injectable()
export class StudentAvatarRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findStudentAvatarState(
    context: StudentAppContext,
  ): Promise<StudentAvatarStateRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: {
        id: context.studentId,
        userId: context.studentUserId,
        status: StudentStatus.ACTIVE,
      },
      ...STUDENT_AVATAR_STATE_ARGS,
    });
  }

  async setStudentAvatarFile(params: {
    context: StudentAppContext;
    avatarFileId: string;
  }): Promise<StudentAvatarStateRecord | null> {
    const result = await this.scopedPrisma.student.updateMany({
      where: {
        id: params.context.studentId,
        userId: params.context.studentUserId,
        status: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      data: {
        avatarFileId: params.avatarFileId,
      },
    });

    if (result.count === 0) {
      return null;
    }

    return this.findStudentAvatarState(params.context);
  }

  async clearStudentAvatarFile(
    context: StudentAppContext,
  ): Promise<StudentAvatarStateRecord | null> {
    const result = await this.scopedPrisma.student.updateMany({
      where: {
        id: context.studentId,
        userId: context.studentUserId,
        status: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      data: {
        avatarFileId: null,
      },
    });

    if (result.count === 0) {
      return null;
    }

    return this.findStudentAvatarState(context);
  }
}

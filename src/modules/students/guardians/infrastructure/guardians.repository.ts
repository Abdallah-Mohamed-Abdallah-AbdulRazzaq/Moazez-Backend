import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { StudentGuardianPrimaryRequiredException } from '../domain/guardian.exceptions';

const STUDENT_SUMMARY_ARGS = Prisma.validator<Prisma.StudentDefaultArgs>()({
  select: {
    id: true,
    firstName: true,
    lastName: true,
    status: true,
  },
});

const GUARDIAN_RECORD_ARGS = Prisma.validator<Prisma.GuardianDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    organizationId: true,
    userId: true,
    firstName: true,
    lastName: true,
    phone: true,
    email: true,
    relation: true,
    isPrimary: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  },
});

const GUARDIAN_PROFILE_ARGS = Prisma.validator<Prisma.GuardianDefaultArgs>()({
  select: {
    ...GUARDIAN_RECORD_ARGS.select,
    students: {
      select: {
        isPrimary: true,
        student: {
          select: STUDENT_SUMMARY_ARGS.select,
        },
      },
      orderBy: [
        { student: { firstName: 'asc' } },
        { student: { lastName: 'asc' } },
      ],
    },
  },
});

const STUDENT_GUARDIAN_LINK_ARGS =
  Prisma.validator<Prisma.StudentGuardianDefaultArgs>()({
    select: {
      id: true,
      studentId: true,
      guardianId: true,
      isPrimary: true,
      guardian: {
        select: GUARDIAN_RECORD_ARGS.select,
      },
      student: {
        select: STUDENT_SUMMARY_ARGS.select,
      },
    },
  });

export type GuardianRecord = Prisma.GuardianGetPayload<typeof GUARDIAN_RECORD_ARGS>;
export type GuardianProfileRecord = Prisma.GuardianGetPayload<
  typeof GUARDIAN_PROFILE_ARGS
>;
export type StudentSummaryRecord = Prisma.StudentGetPayload<
  typeof STUDENT_SUMMARY_ARGS
>;
export type StudentGuardianLinkRecord = Prisma.StudentGuardianGetPayload<
  typeof STUDENT_GUARDIAN_LINK_ARGS
>;

function buildGuardianSearchWhere(search?: string): Prisma.GuardianWhereInput {
  const normalizedSearch = search?.trim();
  if (!normalizedSearch) {
    return {};
  }

  const parts = normalizedSearch
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return {};
  }

  return {
    AND: parts.map((part) => ({
      OR: [
        {
          firstName: {
            contains: part,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          lastName: {
            contains: part,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          phone: {
            contains: part,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          email: {
            contains: part,
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ],
    })),
  };
}

@Injectable()
export class GuardiansRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  listGuardians(filters: {
    search?: string;
    relation?: string;
  }): Promise<GuardianRecord[]> {
    return this.scopedPrisma.guardian.findMany({
      where: {
        ...(filters.relation ? { relation: filters.relation } : {}),
        ...buildGuardianSearchWhere(filters.search),
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { createdAt: 'desc' }],
      ...GUARDIAN_RECORD_ARGS,
    });
  }

  findGuardianById(guardianId: string): Promise<GuardianRecord | null> {
    return this.scopedPrisma.guardian.findFirst({
      where: { id: guardianId },
      ...GUARDIAN_RECORD_ARGS,
    });
  }

  findGuardianProfileById(
    guardianId: string,
  ): Promise<GuardianProfileRecord | null> {
    return this.scopedPrisma.guardian.findFirst({
      where: { id: guardianId },
      ...GUARDIAN_PROFILE_ARGS,
    });
  }

  findStudentById(studentId: string): Promise<StudentSummaryRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId },
      ...STUDENT_SUMMARY_ARGS,
    });
  }

  listStudentGuardians(
    studentId: string,
    options?: { onlyPrimary?: boolean },
  ): Promise<StudentGuardianLinkRecord[]> {
    return this.scopedPrisma.studentGuardian.findMany({
      where: {
        studentId,
        ...(options?.onlyPrimary ? { isPrimary: true } : {}),
      },
      orderBy: [
        { isPrimary: 'desc' },
        { guardian: { firstName: 'asc' } },
        { guardian: { lastName: 'asc' } },
      ],
      ...STUDENT_GUARDIAN_LINK_ARGS,
    });
  }

  createGuardian(
    data: Prisma.GuardianUncheckedCreateInput,
  ): Promise<GuardianRecord> {
    return this.prisma.guardian.create({
      data,
      ...GUARDIAN_RECORD_ARGS,
    });
  }

  async updateGuardian(
    guardianId: string,
    data: Prisma.GuardianUncheckedUpdateInput,
  ): Promise<GuardianRecord | null> {
    const result = await this.scopedPrisma.guardian.updateMany({
      where: {
        id: guardianId,
        deletedAt: null,
      },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.findGuardianById(guardianId);
  }

  linkGuardianToStudent(params: {
    schoolId: string;
    studentId: string;
    guardianId: string;
    isPrimary?: boolean;
  }): Promise<StudentGuardianLinkRecord> {
    const scopedPrisma = this.scopedPrisma;

    return scopedPrisma.$transaction(async (tx) => {
      const existingLink = await tx.studentGuardian.findFirst({
        where: {
          studentId: params.studentId,
          guardianId: params.guardianId,
        },
        ...STUDENT_GUARDIAN_LINK_ARGS,
      });

      const primaryCount = await tx.studentGuardian.count({
        where: {
          studentId: params.studentId,
          isPrimary: true,
        },
      });

      if (existingLink) {
        const shouldPromote = params.isPrimary === true || primaryCount === 0;

        if (shouldPromote) {
          await tx.studentGuardian.updateMany({
            where: {
              studentId: params.studentId,
              isPrimary: true,
              guardianId: { not: params.guardianId },
            },
            data: { isPrimary: false },
          });

          await tx.studentGuardian.updateMany({
            where: {
              studentId: params.studentId,
              guardianId: params.guardianId,
            },
            data: { isPrimary: true },
          });
        }

        return tx.studentGuardian.findFirstOrThrow({
          where: {
            studentId: params.studentId,
            guardianId: params.guardianId,
          },
          ...STUDENT_GUARDIAN_LINK_ARGS,
        });
      }

      const isPrimary = params.isPrimary === true || primaryCount === 0;

      if (isPrimary) {
        await tx.studentGuardian.updateMany({
          where: {
            studentId: params.studentId,
            isPrimary: true,
          },
          data: { isPrimary: false },
        });
      }

      await tx.studentGuardian.create({
        data: {
          schoolId: params.schoolId,
          studentId: params.studentId,
          guardianId: params.guardianId,
          isPrimary,
        },
      });

      return tx.studentGuardian.findFirstOrThrow({
        where: {
          studentId: params.studentId,
          guardianId: params.guardianId,
        },
        ...STUDENT_GUARDIAN_LINK_ARGS,
      });
    });
  }

  updateStudentGuardianLink(params: {
    studentId: string;
    guardianId: string;
    isPrimary?: boolean;
  }): Promise<StudentGuardianLinkRecord | null> {
    const scopedPrisma = this.scopedPrisma;

    return scopedPrisma.$transaction(async (tx) => {
      const link = await tx.studentGuardian.findFirst({
        where: {
          studentId: params.studentId,
          guardianId: params.guardianId,
        },
        ...STUDENT_GUARDIAN_LINK_ARGS,
      });

      if (!link) {
        return null;
      }

      if (params.isPrimary === undefined || params.isPrimary === link.isPrimary) {
        return link;
      }

      if (params.isPrimary) {
        await tx.studentGuardian.updateMany({
          where: {
            studentId: params.studentId,
            isPrimary: true,
            guardianId: { not: params.guardianId },
          },
          data: { isPrimary: false },
        });
      } else {
        const primaryCount = await tx.studentGuardian.count({
          where: {
            studentId: params.studentId,
            isPrimary: true,
          },
        });

        if (primaryCount <= 1) {
          throw new StudentGuardianPrimaryRequiredException({
            studentId: params.studentId,
            guardianId: params.guardianId,
          });
        }
      }

      await tx.studentGuardian.updateMany({
        where: {
          studentId: params.studentId,
          guardianId: params.guardianId,
        },
        data: {
          isPrimary: params.isPrimary,
        },
      });

      return tx.studentGuardian.findFirstOrThrow({
        where: {
          studentId: params.studentId,
          guardianId: params.guardianId,
        },
        ...STUDENT_GUARDIAN_LINK_ARGS,
      });
    });
  }

  unlinkGuardianFromStudent(params: {
    studentId: string;
    guardianId: string;
  }): Promise<boolean> {
    const scopedPrisma = this.scopedPrisma;

    return scopedPrisma.$transaction(async (tx) => {
      const link = await tx.studentGuardian.findFirst({
        where: {
          studentId: params.studentId,
          guardianId: params.guardianId,
        },
        select: {
          id: true,
          isPrimary: true,
        },
      });

      if (!link) {
        return false;
      }

      if (link.isPrimary) {
        const primaryCount = await tx.studentGuardian.count({
          where: {
            studentId: params.studentId,
            isPrimary: true,
          },
        });

        if (primaryCount <= 1) {
          throw new StudentGuardianPrimaryRequiredException({
            studentId: params.studentId,
            guardianId: params.guardianId,
          });
        }
      }

      const result = await tx.studentGuardian.deleteMany({
        where: {
          studentId: params.studentId,
          guardianId: params.guardianId,
        },
      });

      return result.count > 0;
    });
  }
}

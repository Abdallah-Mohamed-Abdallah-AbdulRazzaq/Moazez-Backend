import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const STUDENT_RECORD_ARGS = Prisma.validator<Prisma.StudentDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    organizationId: true,
    applicationId: true,
    firstName: true,
    lastName: true,
    birthDate: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  },
});

export type StudentRecord = Prisma.StudentGetPayload<typeof STUDENT_RECORD_ARGS>;

function buildStudentSearchWhere(search?: string): Prisma.StudentWhereInput {
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
      ],
    })),
  };
}

@Injectable()
export class StudentsRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  listStudents(filters: {
    search?: string;
    status?: StudentRecord['status'];
  }): Promise<StudentRecord[]> {
    return this.scopedPrisma.student.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...buildStudentSearchWhere(filters.search),
      },
      orderBy: [{ createdAt: 'desc' }, { firstName: 'asc' }, { lastName: 'asc' }],
      ...STUDENT_RECORD_ARGS,
    });
  }

  findStudentById(studentId: string): Promise<StudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId },
      ...STUDENT_RECORD_ARGS,
    });
  }

  createStudent(
    data: Prisma.StudentUncheckedCreateInput,
  ): Promise<StudentRecord> {
    return this.prisma.student.create({
      data,
      ...STUDENT_RECORD_ARGS,
    });
  }

  async updateStudent(
    studentId: string,
    data: Prisma.StudentUncheckedUpdateInput,
  ): Promise<StudentRecord | null> {
    const result = await this.scopedPrisma.student.updateMany({
      where: {
        id: studentId,
        deletedAt: null,
      },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.findStudentById(studentId);
  }
}

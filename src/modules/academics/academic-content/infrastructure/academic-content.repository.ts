import { Injectable } from '@nestjs/common';
import { AcademicContentType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ACADEMIC_CONTENT_ARGS =
  Prisma.validator<Prisma.AcademicContentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      type: true,
      createdByUserId: true,
      updatedByUserId: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

export type AcademicContentRecord = Prisma.AcademicContentGetPayload<
  typeof ACADEMIC_CONTENT_ARGS
>;

export type CreateAcademicContentInput = {
  schoolId: string;
  type: AcademicContentType;
  createdByUserId: string;
  updatedByUserId?: string | null;
};

@Injectable()
export class AcademicContentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findById(id: string): Promise<AcademicContentRecord | null> {
    return this.scopedPrisma.academicContent.findFirst({
      where: { id },
      ...ACADEMIC_CONTENT_ARGS,
    });
  }

  create(data: CreateAcademicContentInput): Promise<AcademicContentRecord> {
    return this.scopedPrisma.academicContent.create({
      data: {
        schoolId: data.schoolId,
        type: data.type,
        createdByUserId: data.createdByUserId,
        updatedByUserId: data.updatedByUserId,
      },
      ...ACADEMIC_CONTENT_ARGS,
    });
  }
}

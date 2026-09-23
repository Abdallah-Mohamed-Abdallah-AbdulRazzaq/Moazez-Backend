import { Injectable } from '@nestjs/common';
import {
  AcademicContentAudienceType,
  AcademicContentType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ACADEMIC_CONTENT_ARGS =
  Prisma.validator<Prisma.AcademicContentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      type: true,
      audience: true,
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
  academicYearId: string;
  termId: string;
  type: AcademicContentType;
  audience: AcademicContentAudienceType;
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

  findByIdInSchool(
    id: string,
    schoolId: string,
  ): Promise<AcademicContentRecord | null> {
    return this.prisma.academicContent.findFirst({
      where: { id, schoolId, deletedAt: null },
      ...ACADEMIC_CONTENT_ARGS,
    });
  }

  create(data: CreateAcademicContentInput): Promise<AcademicContentRecord> {
    return this.scopedPrisma.academicContent.create({
      data: {
        schoolId: data.schoolId,
        academicYearId: data.academicYearId,
        termId: data.termId,
        type: data.type,
        audience: data.audience,
        createdByUserId: data.createdByUserId,
        updatedByUserId: data.updatedByUserId,
      },
      ...ACADEMIC_CONTENT_ARGS,
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const YEAR_ARGS = Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
    startDate: true,
    endDate: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  },
});

export type AcademicYearRecord = Prisma.AcademicYearGetPayload<typeof YEAR_ARGS>;

@Injectable()
export class AcademicYearsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error(
        'AcademicYearsRepository requires an active school membership',
      );
    }

    return schoolId;
  }

  listYears(): Promise<AcademicYearRecord[]> {
    return this.scopedPrisma.academicYear.findMany({
      orderBy: [{ startDate: 'desc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
      ...YEAR_ARGS,
    });
  }

  findYearById(yearId: string): Promise<AcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: yearId },
      ...YEAR_ARGS,
    });
  }

  findOverlappingYear(params: {
    startDate: Date;
    endDate: Date;
    excludeYearId?: string;
  }): Promise<AcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: {
        ...(params.excludeYearId ? { id: { not: params.excludeYearId } } : {}),
        startDate: { lte: params.endDate },
        endDate: { gte: params.startDate },
      },
      orderBy: { startDate: 'asc' },
      ...YEAR_ARGS,
    });
  }

  createYear(
    data: Prisma.AcademicYearUncheckedCreateInput,
  ): Promise<AcademicYearRecord> {
    return this.scopedPrisma.academicYear.create({
      data,
      ...YEAR_ARGS,
    });
  }

  createYearAndDeactivateOthers(
    data: Prisma.AcademicYearUncheckedCreateInput,
  ): Promise<AcademicYearRecord> {
    const scopedPrisma = this.scopedPrisma;

    return scopedPrisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      return tx.academicYear.create({
        data,
        ...YEAR_ARGS,
      });
    });
  }

  updateYear(
    yearId: string,
    data: Prisma.AcademicYearUncheckedUpdateInput,
  ): Promise<AcademicYearRecord> {
    return this.prisma.academicYear.update({
      where: {
        id_schoolId: {
          id: yearId,
          schoolId: this.getCurrentSchoolId(),
        },
      },
      data,
      ...YEAR_ARGS,
    });
  }

  updateYearAndDeactivateOthers(
    yearId: string,
    data: Prisma.AcademicYearUncheckedUpdateInput,
  ): Promise<AcademicYearRecord> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({
        where: {
          schoolId,
          isActive: true,
          id: { not: yearId },
        },
        data: { isActive: false },
      });

      return tx.academicYear.update({
        where: {
          id_schoolId: {
            id: yearId,
            schoolId,
          },
        },
        data,
        ...YEAR_ARGS,
      });
    });
  }
}

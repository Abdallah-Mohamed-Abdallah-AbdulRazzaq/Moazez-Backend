import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const TERM_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    academicYearId: true,
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

export type TermRecord = Prisma.TermGetPayload<typeof TERM_ARGS>;

@Injectable()
export class TermsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error('TermsRepository requires an active school membership');
    }

    return schoolId;
  }

  listTerms(academicYearId?: string): Promise<TermRecord[]> {
    return this.scopedPrisma.term.findMany({
      where: academicYearId ? { academicYearId } : undefined,
      orderBy: [{ startDate: 'asc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
      ...TERM_ARGS,
    });
  }

  findTermById(termId: string): Promise<TermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_ARGS,
    });
  }

  createTerm(
    data: Prisma.TermUncheckedCreateInput,
  ): Promise<TermRecord> {
    return this.scopedPrisma.term.create({
      data,
      ...TERM_ARGS,
    });
  }

  updateTerm(
    termId: string,
    data: Prisma.TermUncheckedUpdateInput,
  ): Promise<TermRecord> {
    return this.prisma.term.update({
      where: {
        id_schoolId: {
          id: termId,
          schoolId: this.getCurrentSchoolId(),
        },
      },
      data,
      ...TERM_ARGS,
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const SUBJECT_ARGS = Prisma.validator<Prisma.SubjectDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
    code: true,
    color: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  },
});

export type SubjectRecord = Prisma.SubjectGetPayload<typeof SUBJECT_ARGS>;

export type SoftDeleteSubjectResult =
  | { status: 'deleted' }
  | { status: 'not_found' };

@Injectable()
export class SubjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error('SubjectsRepository requires an active school membership');
    }

    return schoolId;
  }

  listSubjects(): Promise<SubjectRecord[]> {
    return this.scopedPrisma.subject.findMany({
      orderBy: [{ nameEn: 'asc' }, { nameAr: 'asc' }],
      ...SUBJECT_ARGS,
    });
  }

  findSubjectById(subjectId: string): Promise<SubjectRecord | null> {
    return this.scopedPrisma.subject.findFirst({
      where: { id: subjectId },
      ...SUBJECT_ARGS,
    });
  }

  createSubject(
    data: Prisma.SubjectUncheckedCreateInput,
  ): Promise<SubjectRecord> {
    return this.scopedPrisma.subject.create({
      data,
      ...SUBJECT_ARGS,
    });
  }

  updateSubject(
    subjectId: string,
    data: Prisma.SubjectUncheckedUpdateInput,
  ): Promise<SubjectRecord> {
    return this.prisma.subject.update({
      where: {
        id_schoolId: {
          id: subjectId,
          schoolId: this.getCurrentSchoolId(),
        },
      },
      data,
      ...SUBJECT_ARGS,
    });
  }

  softDeleteSubject(subjectId: string): Promise<SoftDeleteSubjectResult> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction(async (tx) => {
      const subject = await tx.subject.findFirst({
        where: { id: subjectId, schoolId, deletedAt: null },
        ...SUBJECT_ARGS,
      });
      if (!subject) {
        return { status: 'not_found' } as SoftDeleteSubjectResult;
      }

      await tx.subject.update({
        where: {
          id_schoolId: {
            id: subjectId,
            schoolId,
          },
        },
        data: { deletedAt: new Date() },
      });

      return { status: 'deleted' } as SoftDeleteSubjectResult;
    });
  }
}

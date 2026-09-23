import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

export interface AcademicContentContext {
  schoolId: string;
  academicYearId: string;
  termId: string;
}

@Injectable()
export class AcademicContentContextValidator {
  constructor(private readonly prisma: PrismaService) {}

  async validate(context: AcademicContentContext): Promise<void> {
    const year = await this.prisma.academicYear.findFirst({
      where: {
        id: context.academicYearId,
        schoolId: context.schoolId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!year) throw new NotFoundDomainException('Academic year not found');

    const term = await this.prisma.term.findFirst({
      where: {
        id: context.termId,
        schoolId: context.schoolId,
        deletedAt: null,
      },
      select: { academicYearId: true },
    });
    if (!term) throw new NotFoundDomainException('Term not found');
    if (term.academicYearId !== year.id) {
      throw new ValidationDomainException(
        'Term does not belong to academic year',
      );
    }
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { buildActiveStudentSeatWhere } from './student-seat-usage.query';

const STUDENT_SEAT_LIMIT_ENTITLEMENT_SELECT =
  Prisma.validator<Prisma.SchoolEntitlementSelect>()({
    id: true,
    schoolId: true,
    studentSeatLimit: true,
  });

export type StudentSeatLimitEntitlementRecord =
  Prisma.SchoolEntitlementGetPayload<{
    select: typeof STUDENT_SEAT_LIMIT_ENTITLEMENT_SELECT;
  }>;

@Injectable()
export class StudentSeatLimitPolicyRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  findEntitlementForCurrentSchool(): Promise<StudentSeatLimitEntitlementRecord | null> {
    return this.scopedPrisma.schoolEntitlement.findFirst({
      select: STUDENT_SEAT_LIMIT_ENTITLEMENT_SELECT,
    });
  }

  async countActiveStudentSeatsForCurrentSchool(): Promise<number> {
    const rows = await this.scopedPrisma.enrollment.findMany({
      where: buildActiveStudentSeatWhere(),
      distinct: ['studentId'],
      select: { studentId: true },
    });

    return rows.length;
  }

  async hasActiveStudentSeatForCurrentSchool(
    studentId: string,
  ): Promise<boolean> {
    const enrollment = await this.scopedPrisma.enrollment.findFirst({
      where: buildActiveStudentSeatWhere({ studentId }),
      select: { id: true },
    });

    return enrollment !== null;
  }
}

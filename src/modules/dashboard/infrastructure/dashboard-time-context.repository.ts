import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';

@Injectable()
export class DashboardTimeContextRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async loadSchoolTimezone(_scope: DashboardScope): Promise<string | null> {
    const profile = await this.scopedPrisma.schoolProfile.findFirst({
      select: { timezone: true },
    });

    return profile?.timezone ?? null;
  }
}

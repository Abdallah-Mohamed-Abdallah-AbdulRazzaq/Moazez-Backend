import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const LEAD_RECORD_ARGS = Prisma.validator<Prisma.LeadDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    organizationId: true,
    studentName: true,
    primaryContactName: true,
    phone: true,
    email: true,
    channel: true,
    status: true,
    notes: true,
    ownerUserId: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  },
});

export type LeadRecord = Prisma.LeadGetPayload<typeof LEAD_RECORD_ARGS>;

@Injectable()
export class LeadsRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  listLeads(filters: {
    status?: Prisma.LeadWhereInput['status'];
    channel?: Prisma.LeadWhereInput['channel'];
  }): Promise<LeadRecord[]> {
    return this.scopedPrisma.lead.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.channel ? { channel: filters.channel } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      ...LEAD_RECORD_ARGS,
    });
  }

  findLeadById(leadId: string): Promise<LeadRecord | null> {
    return this.scopedPrisma.lead.findFirst({
      where: { id: leadId },
      ...LEAD_RECORD_ARGS,
    });
  }

  createLead(data: Prisma.LeadUncheckedCreateInput): Promise<LeadRecord> {
    return this.prisma.lead.create({
      data,
      ...LEAD_RECORD_ARGS,
    });
  }

  async updateLead(
    leadId: string,
    data: Prisma.LeadUncheckedUpdateInput,
  ): Promise<LeadRecord | null> {
    const result = await this.scopedPrisma.lead.updateMany({
      where: {
        id: leadId,
        deletedAt: null,
      },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.findLeadById(leadId);
  }
}

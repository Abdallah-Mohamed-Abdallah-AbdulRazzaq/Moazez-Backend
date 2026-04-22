import { Injectable } from '@nestjs/common';
import { requireLeadsScope } from '../leads-scope';
import { ListLeadsQueryDto, LeadResponseDto } from '../dto/lead.dto';
import { mapLeadChannelFromApi, mapLeadStatusFromApi } from '../domain/lead.enums';
import { LeadsRepository } from '../infrastructure/leads.repository';
import { presentLead } from '../presenters/lead.presenter';

@Injectable()
export class ListLeadsUseCase {
  constructor(private readonly leadsRepository: LeadsRepository) {}

  async execute(query: ListLeadsQueryDto): Promise<LeadResponseDto[]> {
    requireLeadsScope();

    const leads = await this.leadsRepository.listLeads({
      status: query.status ? mapLeadStatusFromApi(query.status) : undefined,
      channel: query.channel ? mapLeadChannelFromApi(query.channel) : undefined,
    });

    return leads.map((lead) => presentLead(lead));
  }
}

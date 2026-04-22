import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireLeadsScope } from '../leads-scope';
import { LeadResponseDto } from '../dto/lead.dto';
import { LeadsRepository } from '../infrastructure/leads.repository';
import { presentLead } from '../presenters/lead.presenter';

@Injectable()
export class GetLeadUseCase {
  constructor(private readonly leadsRepository: LeadsRepository) {}

  async execute(leadId: string): Promise<LeadResponseDto> {
    requireLeadsScope();

    const lead = await this.leadsRepository.findLeadById(leadId);
    if (!lead) {
      throw new NotFoundDomainException('Lead not found', { leadId });
    }

    return presentLead(lead);
  }
}

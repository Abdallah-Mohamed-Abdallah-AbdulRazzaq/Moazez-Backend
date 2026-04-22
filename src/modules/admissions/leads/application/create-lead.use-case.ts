import { Injectable } from '@nestjs/common';
import { requireLeadsScope } from '../leads-scope';
import { CreateLeadDto, LeadResponseDto } from '../dto/lead.dto';
import { mapLeadChannelFromApi } from '../domain/lead.enums';
import {
  normalizeOptionalText,
  normalizeRequiredText,
} from '../domain/lead-inputs';
import { LeadsRepository } from '../infrastructure/leads.repository';
import { presentLead } from '../presenters/lead.presenter';

@Injectable()
export class CreateLeadUseCase {
  constructor(private readonly leadsRepository: LeadsRepository) {}

  async execute(command: CreateLeadDto): Promise<LeadResponseDto> {
    const scope = requireLeadsScope();

    const lead = await this.leadsRepository.createLead({
      schoolId: scope.schoolId,
      organizationId: scope.organizationId,
      studentName: normalizeRequiredText(command.studentName),
      primaryContactName: normalizeRequiredText(command.primaryContactName),
      phone: normalizeRequiredText(command.phone),
      email: normalizeOptionalText(command.email),
      channel: mapLeadChannelFromApi(command.channel),
      status: 'NEW',
      notes: normalizeOptionalText(command.notes),
      ownerUserId: null,
    });

    return presentLead(lead);
  }
}

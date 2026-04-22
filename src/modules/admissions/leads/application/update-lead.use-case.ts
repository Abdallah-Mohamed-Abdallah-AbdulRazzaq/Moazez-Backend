import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireLeadsScope } from '../leads-scope';
import { LeadResponseDto, UpdateLeadDto } from '../dto/lead.dto';
import {
  mapLeadChannelFromApi,
  mapLeadStatusFromApi,
} from '../domain/lead.enums';
import { normalizeOptionalText, normalizeRequiredText } from '../domain/lead-inputs';
import { LeadsRepository } from '../infrastructure/leads.repository';
import { presentLead } from '../presenters/lead.presenter';

@Injectable()
export class UpdateLeadUseCase {
  constructor(private readonly leadsRepository: LeadsRepository) {}

  async execute(
    leadId: string,
    command: UpdateLeadDto,
  ): Promise<LeadResponseDto> {
    requireLeadsScope();

    const lead = await this.leadsRepository.updateLead(leadId, {
      ...(command.studentName !== undefined
        ? { studentName: normalizeRequiredText(command.studentName) }
        : {}),
      ...(command.primaryContactName !== undefined
        ? {
            primaryContactName: normalizeRequiredText(
              command.primaryContactName,
            ),
          }
        : {}),
      ...(command.phone !== undefined
        ? { phone: normalizeRequiredText(command.phone) }
        : {}),
      ...(command.email !== undefined
        ? { email: normalizeOptionalText(command.email) }
        : {}),
      ...(command.channel !== undefined
        ? { channel: mapLeadChannelFromApi(command.channel) }
        : {}),
      ...(command.status !== undefined
        ? { status: mapLeadStatusFromApi(command.status) }
        : {}),
      ...(command.notes !== undefined
        ? { notes: normalizeOptionalText(command.notes) }
        : {}),
    });

    if (!lead) {
      throw new NotFoundDomainException('Lead not found', { leadId });
    }

    return presentLead(lead);
  }
}

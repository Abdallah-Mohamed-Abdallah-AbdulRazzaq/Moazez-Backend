import { LeadResponseDto } from '../dto/lead.dto';
import { LeadRecord } from '../infrastructure/leads.repository';
import { mapLeadChannelToApi, mapLeadStatusToApi } from '../domain/lead.enums';

export function presentLead(lead: LeadRecord): LeadResponseDto {
  return {
    id: lead.id,
    studentName: lead.studentName,
    primaryContactName: lead.primaryContactName,
    phone: lead.phone,
    email: lead.email,
    channel: mapLeadChannelToApi(lead.channel),
    status: mapLeadStatusToApi(lead.status),
    notes: lead.notes,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

import { LeadChannel, LeadStatus } from '@prisma/client';

export const LEAD_CHANNEL_API_VALUES = [
  'In-app',
  'Referral',
  'Walk-in',
  'Other',
] as const;

export const LEAD_STATUS_API_VALUES = [
  'New',
  'Contacted',
  'Converted',
  'Closed',
] as const;

export type LeadChannelApiValue = (typeof LEAD_CHANNEL_API_VALUES)[number];
export type LeadStatusApiValue = (typeof LEAD_STATUS_API_VALUES)[number];

export function mapLeadChannelFromApi(value: LeadChannelApiValue): LeadChannel {
  switch (value) {
    case 'In-app':
      return LeadChannel.IN_APP;
    case 'Referral':
      return LeadChannel.REFERRAL;
    case 'Walk-in':
      return LeadChannel.WALK_IN;
    case 'Other':
      return LeadChannel.OTHER;
  }
}

export function mapLeadStatusFromApi(value: LeadStatusApiValue): LeadStatus {
  switch (value) {
    case 'New':
      return LeadStatus.NEW;
    case 'Contacted':
      return LeadStatus.CONTACTED;
    case 'Converted':
      return LeadStatus.CONVERTED;
    case 'Closed':
      return LeadStatus.CLOSED;
  }
}

export function mapLeadChannelToApi(value: LeadChannel): LeadChannelApiValue {
  switch (value) {
    case LeadChannel.IN_APP:
      return 'In-app';
    case LeadChannel.REFERRAL:
      return 'Referral';
    case LeadChannel.WALK_IN:
      return 'Walk-in';
    case LeadChannel.OTHER:
      return 'Other';
  }
}

export function mapLeadStatusToApi(value: LeadStatus): LeadStatusApiValue {
  switch (value) {
    case LeadStatus.NEW:
      return 'New';
    case LeadStatus.CONTACTED:
      return 'Contacted';
    case LeadStatus.CONVERTED:
      return 'Converted';
    case LeadStatus.CLOSED:
      return 'Closed';
  }
}

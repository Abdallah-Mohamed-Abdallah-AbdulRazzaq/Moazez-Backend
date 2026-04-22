import { IsIn, IsOptional, IsPhoneNumber, IsString, MaxLength } from 'class-validator';
import {
  LEAD_CHANNEL_API_VALUES,
  LEAD_STATUS_API_VALUES,
} from '../domain/lead.enums';
import type { LeadChannelApiValue, LeadStatusApiValue } from '../domain/lead.enums';

export class ListLeadsQueryDto {
  @IsOptional()
  @IsIn(LEAD_STATUS_API_VALUES)
  status?: LeadStatusApiValue;

  @IsOptional()
  @IsIn(LEAD_CHANNEL_API_VALUES)
  channel?: LeadChannelApiValue;
}

export class CreateLeadDto {
  @IsString()
  @MaxLength(200)
  studentName!: string;

  @IsString()
  @MaxLength(200)
  primaryContactName!: string;

  @IsPhoneNumber()
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsIn(LEAD_CHANNEL_API_VALUES)
  channel!: LeadChannelApiValue;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  studentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  primaryContactName?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsIn(LEAD_CHANNEL_API_VALUES)
  channel?: LeadChannelApiValue;

  @IsOptional()
  @IsIn(LEAD_STATUS_API_VALUES)
  status?: LeadStatusApiValue;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class LeadResponseDto {
  id!: string;
  studentName!: string;
  primaryContactName!: string | null;
  phone!: string;
  email!: string | null;
  channel!: LeadChannelApiValue;
  status!: LeadStatusApiValue;
  notes!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

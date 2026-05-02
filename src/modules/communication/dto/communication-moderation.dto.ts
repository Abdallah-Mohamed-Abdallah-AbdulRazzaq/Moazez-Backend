import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { COMMUNICATION_MODERATION_ACTIONS } from '../domain/communication-moderation-domain';

export class CreateCommunicationModerationActionDto {
  @IsIn(COMMUNICATION_MODERATION_ACTIONS)
  action!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

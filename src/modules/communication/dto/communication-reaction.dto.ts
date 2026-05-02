import { IsIn } from 'class-validator';
import { COMMUNICATION_REACTION_TYPES } from '../domain/communication-reaction-domain';

export class UpsertCommunicationReactionDto {
  @IsIn(COMMUNICATION_REACTION_TYPES)
  type!: string;
}

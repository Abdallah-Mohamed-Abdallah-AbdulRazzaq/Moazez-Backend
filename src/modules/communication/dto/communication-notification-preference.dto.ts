import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { COMMUNICATION_NOTIFICATION_PREFERENCE_CATEGORIES } from '../domain/communication-notification-preference-domain';

export class UpdateCommunicationNotificationPreferenceItemDto {
  @IsIn(COMMUNICATION_NOTIFICATION_PREFERENCE_CATEGORIES)
  category!: string;

  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  in_app_enabled?: boolean;
}

export class UpdateCommunicationNotificationPreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateCommunicationNotificationPreferenceItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  preferences!: UpdateCommunicationNotificationPreferenceItemDto[];
}

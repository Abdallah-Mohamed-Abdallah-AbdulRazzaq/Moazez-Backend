import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  ACADEMIC_CONTENT_REMINDER_MAX_OFFSETS,
  ACADEMIC_CONTENT_REMINDER_MIN_MINUTES,
  ACADEMIC_CONTENT_REMINDER_MAX_MINUTES,
} from '../domain/academic-content-notification.policy';

export class UpdateAcademicContentNotificationPolicyDto {
  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  notificationsEnabled?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  studentNotificationsEnabled?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  guardianNotificationsEnabled?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  weeklyPlanNotificationsEnabled?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  guardianWeeklyNoteNotificationsEnabled?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  subjectResourceNotificationsEnabled?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  onlineSessionNotificationsEnabled?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  generalResourceNotificationsEnabled?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  significantUpdateNotificationsEnabled?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  cancellationNotificationsEnabled?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  onlineSessionRemindersEnabled?: boolean;

  @ApiPropertyOptional({
    type: [Number],
    maxItems: 5,
    uniqueItems: true,
    items: { type: 'integer', minimum: 5, maximum: 10080 },
    description:
      'Up to five unique offsets in minutes; normalized ascending. Empty means no reminders. Disabling reminders preserves offsets.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(ACADEMIC_CONTENT_REMINDER_MAX_OFFSETS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(ACADEMIC_CONTENT_REMINDER_MIN_MINUTES, { each: true })
  @Max(ACADEMIC_CONTENT_REMINDER_MAX_MINUTES, { each: true })
  onlineSessionReminderOffsetsMinutes?: number[];
}

export class AcademicContentNotificationPolicyResponseDto {
  @ApiProperty({ type: Boolean, default: true })
  notificationsEnabled!: boolean;

  @ApiProperty({ type: Boolean, default: true })
  studentNotificationsEnabled!: boolean;

  @ApiProperty({ type: Boolean, default: true })
  guardianNotificationsEnabled!: boolean;

  @ApiProperty({ type: Boolean, default: true })
  weeklyPlanNotificationsEnabled!: boolean;

  @ApiProperty({ type: Boolean, default: true })
  guardianWeeklyNoteNotificationsEnabled!: boolean;

  @ApiProperty({ type: Boolean, default: true })
  subjectResourceNotificationsEnabled!: boolean;

  @ApiProperty({ type: Boolean, default: true })
  onlineSessionNotificationsEnabled!: boolean;

  @ApiProperty({ type: Boolean, default: true })
  generalResourceNotificationsEnabled!: boolean;

  @ApiProperty({ type: Boolean, default: true })
  significantUpdateNotificationsEnabled!: boolean;

  @ApiProperty({ type: Boolean, default: true })
  cancellationNotificationsEnabled!: boolean;

  @ApiProperty({ type: Boolean, default: false })
  onlineSessionRemindersEnabled!: boolean;

  @ApiProperty({
    type: [Number],
    default: [],
    maxItems: 5,
    uniqueItems: true,
    items: { type: 'integer', minimum: 5, maximum: 10080 },
  })
  onlineSessionReminderOffsetsMinutes!: number[];
}

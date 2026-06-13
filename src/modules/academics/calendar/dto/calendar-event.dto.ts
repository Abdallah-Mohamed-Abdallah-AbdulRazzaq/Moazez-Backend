import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export enum CalendarEventTypeDto {
  HOLIDAY = 'holiday',
  EXAM = 'exam',
  ACTIVITY = 'activity',
  OTHER = 'other',
}

export enum CalendarEventScopeTypeDto {
  SCHOOL = 'school',
  STAGE = 'stage',
  GRADE = 'grade',
  SECTION = 'section',
}

export class CreateCalendarEventDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  termId!: string;

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsEnum(CalendarEventTypeDto)
  type!: CalendarEventTypeDto;

  @IsEnum(CalendarEventScopeTypeDto)
  scopeType!: CalendarEventScopeTypeDto;

  @IsOptional()
  @IsUUID()
  scopeId?: string | null;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsOptional()
  @IsEnum(CalendarEventTypeDto)
  type?: CalendarEventTypeDto;

  @IsOptional()
  @IsEnum(CalendarEventScopeTypeDto)
  scopeType?: CalendarEventScopeTypeDto;

  @IsOptional()
  @IsUUID()
  scopeId?: string | null;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

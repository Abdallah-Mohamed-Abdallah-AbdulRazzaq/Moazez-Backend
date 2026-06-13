import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  CalendarEventScopeTypeDto,
  CalendarEventTypeDto,
} from './calendar-event.dto';

export class ListCalendarEventsQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID()
  cursor?: string;
}

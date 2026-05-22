import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CreateTimetableEntryUseCase } from './application/create-timetable-entry.use-case';
import { CreateTimetablePeriodUseCase } from './application/create-timetable-period.use-case';
import { DeleteTimetableEntryUseCase } from './application/delete-timetable-entry.use-case';
import { DeleteTimetablePeriodUseCase } from './application/delete-timetable-period.use-case';
import { GetTimetableConfigUseCase } from './application/get-timetable-config.use-case';
import { GetTimetableEntryUseCase } from './application/get-timetable-entry.use-case';
import { GetTimetablePreviewUseCase } from './application/get-timetable-preview.use-case';
import { GetTimetablePublicationUseCase } from './application/get-timetable-publication.use-case';
import { ListTimetableConflictsUseCase } from './application/list-timetable-conflicts.use-case';
import { ListTimetableEntriesUseCase } from './application/list-timetable-entries.use-case';
import { ListTimetablePeriodsUseCase } from './application/list-timetable-periods.use-case';
import { PublishTimetableUseCase } from './application/publish-timetable.use-case';
import { TimetableAttendanceCompatibilityService } from './application/timetable-attendance-compatibility.service';
import { UpdateTimetableEntryUseCase } from './application/update-timetable-entry.use-case';
import { UpdateTimetablePeriodUseCase } from './application/update-timetable-period.use-case';
import { UpsertTimetableConfigUseCase } from './application/upsert-timetable-config.use-case';
import { TimetableController } from './controller/timetable.controller';
import { TimetableRepository } from './infrastructure/timetable.repository';

@Module({
  imports: [PrismaModule],
  controllers: [TimetableController],
  providers: [
    TimetableRepository,
    GetTimetableConfigUseCase,
    UpsertTimetableConfigUseCase,
    ListTimetablePeriodsUseCase,
    CreateTimetablePeriodUseCase,
    UpdateTimetablePeriodUseCase,
    DeleteTimetablePeriodUseCase,
    ListTimetableEntriesUseCase,
    GetTimetableEntryUseCase,
    CreateTimetableEntryUseCase,
    UpdateTimetableEntryUseCase,
    DeleteTimetableEntryUseCase,
    GetTimetablePreviewUseCase,
    ListTimetableConflictsUseCase,
    GetTimetablePublicationUseCase,
    PublishTimetableUseCase,
    TimetableAttendanceCompatibilityService,
  ],
  exports: [TimetableRepository, TimetableAttendanceCompatibilityService],
})
export class TimetableModule {}

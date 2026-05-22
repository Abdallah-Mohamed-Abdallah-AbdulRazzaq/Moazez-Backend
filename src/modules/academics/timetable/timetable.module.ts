import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CreateTimetablePeriodUseCase } from './application/create-timetable-period.use-case';
import { DeleteTimetablePeriodUseCase } from './application/delete-timetable-period.use-case';
import { GetTimetableConfigUseCase } from './application/get-timetable-config.use-case';
import { GetTimetablePreviewUseCase } from './application/get-timetable-preview.use-case';
import { ListTimetableConflictsUseCase } from './application/list-timetable-conflicts.use-case';
import { ListTimetablePeriodsUseCase } from './application/list-timetable-periods.use-case';
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
    GetTimetablePreviewUseCase,
    ListTimetableConflictsUseCase,
  ],
  exports: [TimetableRepository],
})
export class TimetableModule {}

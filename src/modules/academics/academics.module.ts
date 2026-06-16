import { Module } from '@nestjs/common';
import { CalendarModule } from './calendar/calendar.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { LessonPlansModule } from './lesson-plans/lesson-plans.module';
import { OverviewModule } from './overview/overview.module';
import { RoomsModule } from './rooms/rooms.module';
import { StructureModule } from './structure/structure.module';
import { SubjectAllocationModule } from './subject-allocation/subject-allocation.module';
import { SubjectsModule } from './subjects/subjects.module';
import { TimetableModule } from './timetable/timetable.module';
import { TeacherAllocationModule } from './teacher-allocation/teacher-allocation.module';

@Module({
  imports: [
    StructureModule,
    SubjectsModule,
    SubjectAllocationModule,
    RoomsModule,
    TeacherAllocationModule,
    CalendarModule,
    OverviewModule,
    CurriculumModule,
    LessonPlansModule,
    TimetableModule,
  ],
})
export class AcademicsModule {}

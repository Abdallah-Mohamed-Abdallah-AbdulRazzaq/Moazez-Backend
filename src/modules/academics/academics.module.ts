import { Module } from '@nestjs/common';
import { CurriculumModule } from './curriculum/curriculum.module';
import { LessonPlansModule } from './lesson-plans/lesson-plans.module';
import { RoomsModule } from './rooms/rooms.module';
import { StructureModule } from './structure/structure.module';
import { SubjectsModule } from './subjects/subjects.module';
import { TimetableModule } from './timetable/timetable.module';
import { TeacherAllocationModule } from './teacher-allocation/teacher-allocation.module';

@Module({
  imports: [
    StructureModule,
    SubjectsModule,
    RoomsModule,
    TeacherAllocationModule,
    CurriculumModule,
    LessonPlansModule,
    TimetableModule,
  ],
})
export class AcademicsModule {}

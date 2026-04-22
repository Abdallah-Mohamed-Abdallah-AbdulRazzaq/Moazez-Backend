import { Module } from '@nestjs/common';
import { RoomsModule } from './rooms/rooms.module';
import { StructureModule } from './structure/structure.module';
import { SubjectsModule } from './subjects/subjects.module';
import { TeacherAllocationModule } from './teacher-allocation/teacher-allocation.module';

@Module({
  imports: [StructureModule, SubjectsModule, RoomsModule, TeacherAllocationModule],
})
export class AcademicsModule {}

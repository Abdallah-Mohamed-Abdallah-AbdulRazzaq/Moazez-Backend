import { Module } from '@nestjs/common';
import { StudentsRecordsModule } from '../students/students.module';
import { CreateStudentNoteUseCase } from './application/create-student-note.use-case';
import { ListStudentNotesUseCase } from './application/list-student-notes.use-case';
import { UpdateStudentNoteUseCase } from './application/update-student-note.use-case';
import { StudentNotesController } from './controller/student-notes.controller';
import { StudentNotesRepository } from './infrastructure/student-notes.repository';

@Module({
  imports: [StudentsRecordsModule],
  controllers: [StudentNotesController],
  providers: [
    StudentNotesRepository,
    ListStudentNotesUseCase,
    CreateStudentNoteUseCase,
    UpdateStudentNoteUseCase,
  ],
})
export class NotesModule {}

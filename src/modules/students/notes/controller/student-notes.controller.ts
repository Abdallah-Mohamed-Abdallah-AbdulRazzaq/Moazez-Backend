import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateStudentNoteUseCase } from '../application/create-student-note.use-case';
import { ListStudentNotesUseCase } from '../application/list-student-notes.use-case';
import { UpdateStudentNoteUseCase } from '../application/update-student-note.use-case';
import {
  CreateStudentNoteDto,
  StudentNoteResponseDto,
  UpdateStudentNoteDto,
} from '../dto/student-note.dto';

@ApiTags('students-guardians')
@ApiBearerAuth()
@Controller('students-guardians/students')
export class StudentNotesController {
  constructor(
    private readonly listStudentNotesUseCase: ListStudentNotesUseCase,
    private readonly createStudentNoteUseCase: CreateStudentNoteUseCase,
    private readonly updateStudentNoteUseCase: UpdateStudentNoteUseCase,
  ) {}

  @Get(':studentId/notes')
  @ApiOkResponse({ type: StudentNoteResponseDto, isArray: true })
  @RequiredPermissions('students.notes.view')
  listStudentNotes(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<StudentNoteResponseDto[]> {
    return this.listStudentNotesUseCase.execute(studentId);
  }

  @Post(':studentId/notes')
  @ApiCreatedResponse({ type: StudentNoteResponseDto })
  @RequiredPermissions('students.notes.manage')
  createStudentNote(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body() dto: CreateStudentNoteDto,
  ): Promise<StudentNoteResponseDto> {
    return this.createStudentNoteUseCase.execute(studentId, dto);
  }

  @Patch(':studentId/notes/:noteId')
  @ApiOkResponse({ type: StudentNoteResponseDto })
  @RequiredPermissions('students.notes.manage')
  updateStudentNote(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('noteId', new ParseUUIDPipe()) noteId: string,
    @Body() dto: UpdateStudentNoteDto,
  ): Promise<StudentNoteResponseDto> {
    return this.updateStudentNoteUseCase.execute(studentId, noteId, dto);
  }
}

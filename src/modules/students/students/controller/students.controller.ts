import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateStudentUseCase } from '../application/create-student.use-case';
import { GetStudentTimelineUseCase } from '../application/get-student-timeline.use-case';
import { GetStudentUseCase } from '../application/get-student.use-case';
import { ListStudentsUseCase } from '../application/list-students.use-case';
import { UpdateStudentUseCase } from '../application/update-student.use-case';
import {
  CreateStudentDto,
  ListStudentsQueryDto,
  StudentResponseDto,
  UpdateStudentDto,
} from '../dto/student.dto';
import {
  StudentTimelineEventResponseDto,
} from '../dto/student-timeline.dto';

@ApiTags('students-records')
@ApiBearerAuth()
@Controller('students-guardians/students')
export class StudentsController {
  constructor(
    private readonly listStudentsUseCase: ListStudentsUseCase,
    private readonly createStudentUseCase: CreateStudentUseCase,
    private readonly getStudentUseCase: GetStudentUseCase,
    private readonly updateStudentUseCase: UpdateStudentUseCase,
    private readonly getStudentTimelineUseCase: GetStudentTimelineUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentResponseDto, isArray: true })
  @RequiredPermissions('students.records.view')
  listStudents(
    @Query() query: ListStudentsQueryDto,
  ): Promise<StudentResponseDto[]> {
    return this.listStudentsUseCase.execute(query);
  }

  @Post()
  @ApiCreatedResponse({ type: StudentResponseDto })
  @RequiredPermissions('students.records.manage')
  createStudent(
    @Body() dto: CreateStudentDto,
  ): Promise<StudentResponseDto> {
    return this.createStudentUseCase.execute(dto);
  }

  @Get(':studentId')
  @ApiOkResponse({ type: StudentResponseDto })
  @RequiredPermissions('students.records.view')
  getStudent(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<StudentResponseDto> {
    return this.getStudentUseCase.execute(studentId);
  }

  @Get(':studentId/timeline')
  @ApiOkResponse({ type: StudentTimelineEventResponseDto, isArray: true })
  @RequiredPermissions('students.records.view')
  getStudentTimeline(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<StudentTimelineEventResponseDto[]> {
    return this.getStudentTimelineUseCase.execute(studentId);
  }

  @Patch(':studentId')
  @ApiOkResponse({ type: StudentResponseDto })
  @RequiredPermissions('students.records.manage')
  updateStudent(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body() dto: UpdateStudentDto,
  ): Promise<StudentResponseDto> {
    return this.updateStudentUseCase.execute(studentId, dto);
  }
}

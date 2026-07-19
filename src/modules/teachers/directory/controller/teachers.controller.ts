import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetTeacherUseCase } from '../application/get-teacher.use-case';
import { ListTeachersUseCase } from '../application/list-teachers.use-case';
import { UpdateTeacherUseCase } from '../application/update-teacher.use-case';
import {
  ListTeachersQueryDto,
  TeacherDirectoryDetailDto,
  TeachersListResponseDto,
  UpdateTeacherDto,
} from '../dto/teacher-directory.dto';

@ApiTags('teachers-directory')
@ApiBearerAuth()
@Controller('teachers')
export class TeachersController {
  constructor(
    private readonly listTeachersUseCase: ListTeachersUseCase,
    private readonly getTeacherUseCase: GetTeacherUseCase,
    private readonly updateTeacherUseCase: UpdateTeacherUseCase,
  ) {}

  @Get()
  @RequiredPermissions('teachers.records.view')
  @ApiOperation({ summary: 'List current-school Teacher Directory records' })
  @ApiOkResponse({ type: TeachersListResponseDto })
  @ApiForbiddenResponse({ description: 'Requires teachers.records.view.' })
  list(@Query() query: ListTeachersQueryDto): Promise<TeachersListResponseDto> {
    return this.listTeachersUseCase.execute(query);
  }

  @Get(':teacherId')
  @RequiredPermissions('teachers.records.view')
  @ApiOperation({ summary: 'Get a current-school Teacher Directory record' })
  @ApiParam({ name: 'teacherId', format: 'uuid' })
  @ApiOkResponse({ type: TeacherDirectoryDetailDto })
  @ApiNotFoundResponse({ description: 'teachers.profile.not_found' })
  get(
    @Param('teacherId', new ParseUUIDPipe()) teacherId: string,
  ): Promise<TeacherDirectoryDetailDto> {
    return this.getTeacherUseCase.execute(teacherId);
  }

  @Patch(':teacherId')
  @RequiredPermissions('teachers.records.manage')
  @ApiOperation({ summary: 'Update a managed Teacher Directory record' })
  @ApiParam({ name: 'teacherId', format: 'uuid' })
  @ApiOkResponse({ type: TeacherDirectoryDetailDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiNotFoundResponse({ description: 'teachers.profile.not_found' })
  @ApiConflictResponse({
    description:
      'teachers.profile.code_conflict | teachers.account.identity_conflict | teachers.account.role_transition_conflict',
  })
  @ApiForbiddenResponse({ description: 'Requires teachers.records.manage.' })
  update(
    @Param('teacherId', new ParseUUIDPipe()) teacherId: string,
    @Body() command: UpdateTeacherDto,
  ): Promise<TeacherDirectoryDetailDto> {
    return this.updateTeacherUseCase.execute(teacherId, command);
  }
}

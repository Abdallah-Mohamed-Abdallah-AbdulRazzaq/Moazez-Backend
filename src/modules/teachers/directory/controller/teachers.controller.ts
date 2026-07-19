import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateTeacherUseCase } from '../application/create-teacher.use-case';
import { ChangeTeacherEmploymentStatusUseCase } from '../application/change-teacher-employment-status.use-case';
import { GetTeacherUseCase } from '../application/get-teacher.use-case';
import { ListTeachersUseCase } from '../application/list-teachers.use-case';
import { UpdateTeacherUseCase } from '../application/update-teacher.use-case';
import { ArchiveTeacherUseCase } from '../application/archive-teacher.use-case';
import { RehireTeacherUseCase } from '../application/rehire-teacher.use-case';
import {
  CreateTeacherDto,
  ListTeachersQueryDto,
  TeacherDirectoryDetailDto,
  TeacherEmploymentStatusResponseDto,
  TeachersListResponseDto,
  UpdateTeacherEmploymentStatusDto,
  UpdateTeacherDto,
  RehireTeacherDto,
} from '../dto/teacher-directory.dto';

@ApiTags('teachers-directory')
@ApiBearerAuth()
@Controller('teachers')
export class TeachersController {
  constructor(
    private readonly listTeachersUseCase: ListTeachersUseCase,
    private readonly getTeacherUseCase: GetTeacherUseCase,
    private readonly createTeacherUseCase: CreateTeacherUseCase,
    private readonly updateTeacherUseCase: UpdateTeacherUseCase,
    private readonly changeEmploymentStatusUseCase: ChangeTeacherEmploymentStatusUseCase,
    private readonly archiveTeacherUseCase: ArchiveTeacherUseCase,
    private readonly rehireTeacherUseCase: RehireTeacherUseCase,
  ) {}

  @Post()
  @RequiredPermissions('teachers.records.manage')
  @ApiOperation({ summary: 'Provision a complete current-school Teacher' })
  @ApiCreatedResponse({ type: TeacherDirectoryDetailDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiConflictResponse({
    description:
      'teachers.profile.code_conflict | teachers.profile.incomplete | teachers.account.identity_conflict | teachers.account.role_transition_conflict',
  })
  @ApiForbiddenResponse({ description: 'Requires teachers.records.manage.' })
  create(
    @Body() command: CreateTeacherDto,
  ): Promise<TeacherDirectoryDetailDto> {
    return this.createTeacherUseCase.execute(command);
  }

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

  @Patch(':teacherId/employment-status')
  @RequiredPermissions('teachers.records.manage')
  @ApiOperation({ summary: 'Change a Teacher employment lifecycle state' })
  @ApiParam({ name: 'teacherId', format: 'uuid' })
  @ApiOkResponse({ type: TeacherEmploymentStatusResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiNotFoundResponse({ description: 'teachers.profile.not_found' })
  @ApiConflictResponse({
    description:
      'teachers.profile.incomplete | teachers.account.role_transition_conflict | teachers.lifecycle.invalid_transition',
  })
  @ApiServiceUnavailableResponse({
    description: 'teachers.lifecycle.revocation_failed',
  })
  @ApiForbiddenResponse({ description: 'Requires teachers.records.manage.' })
  changeEmploymentStatus(
    @Param('teacherId', new ParseUUIDPipe()) teacherId: string,
    @Body() command: UpdateTeacherEmploymentStatusDto,
  ): Promise<TeacherEmploymentStatusResponseDto> {
    return this.changeEmploymentStatusUseCase.execute(teacherId, command);
  }

  @Post(':teacherId/rehire')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('teachers.records.manage')
  @ApiOperation({ summary: 'Restore an archived same-school Teacher' })
  @ApiParam({ name: 'teacherId', format: 'uuid' })
  @ApiOkResponse({ type: TeacherDirectoryDetailDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiNotFoundResponse({ description: 'teachers.profile.not_found' })
  @ApiConflictResponse({
    description:
      'teachers.profile.code_conflict | teachers.profile.incomplete | teachers.account.role_transition_conflict',
  })
  @ApiServiceUnavailableResponse({
    description: 'teachers.lifecycle.revocation_failed',
  })
  @ApiForbiddenResponse({ description: 'Requires teachers.records.manage.' })
  rehire(
    @Param('teacherId', new ParseUUIDPipe()) teacherId: string,
    @Body() command: RehireTeacherDto,
  ): Promise<TeacherDirectoryDetailDto> {
    return this.rehireTeacherUseCase.execute(teacherId, command);
  }

  @Delete(':teacherId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredPermissions('teachers.records.manage')
  @ApiOperation({ summary: 'Soft-archive a same-school Teacher' })
  @ApiParam({ name: 'teacherId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Teacher archived.' })
  @ApiNotFoundResponse({ description: 'teachers.profile.not_found' })
  @ApiConflictResponse({
    description:
      'teachers.lifecycle.active_assignments | teachers.lifecycle.archive_conflict | teachers.account.role_transition_conflict',
  })
  @ApiServiceUnavailableResponse({
    description: 'teachers.lifecycle.revocation_failed',
  })
  @ApiForbiddenResponse({ description: 'Requires teachers.records.manage.' })
  archive(
    @Param('teacherId', new ParseUUIDPipe()) teacherId: string,
  ): Promise<void> {
    return this.archiveTeacherUseCase.execute(teacherId);
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

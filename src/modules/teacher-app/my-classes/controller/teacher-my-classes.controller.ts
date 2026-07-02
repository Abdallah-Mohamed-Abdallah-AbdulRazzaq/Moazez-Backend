import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetTeacherClassDetailUseCase } from '../application/get-teacher-class-detail.use-case';
import { ListTeacherClassesUseCase } from '../application/list-teacher-classes.use-case';
import {
  ListTeacherClassesQueryDto,
  TeacherClassDetailResponseDto,
  TeacherClassesListResponseDto,
} from '../dto/teacher-my-classes.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/my-classes')
export class TeacherMyClassesController {
  constructor(
    private readonly listTeacherClassesUseCase: ListTeacherClassesUseCase,
    private readonly getTeacherClassDetailUseCase: GetTeacherClassDetailUseCase,
  ) {}

  @Get()
  @RequiredPermissions('teacher.classes.view')
  @ApiOkResponse({ type: TeacherClassesListResponseDto })
  listMyClasses(
    @Query() query: ListTeacherClassesQueryDto,
  ): Promise<TeacherClassesListResponseDto> {
    return this.listTeacherClassesUseCase.execute(query);
  }

  @Get(':classId')
  @RequiredPermissions('teacher.classes.view')
  @ApiOkResponse({ type: TeacherClassDetailResponseDto })
  getMyClassDetail(
    @Param('classId', new ParseUUIDPipe()) classId: string,
  ): Promise<TeacherClassDetailResponseDto> {
    return this.getTeacherClassDetailUseCase.execute(classId);
  }
}

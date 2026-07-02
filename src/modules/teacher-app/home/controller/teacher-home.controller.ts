import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetTeacherHomeUseCase } from '../application/get-teacher-home.use-case';
import { TeacherHomeResponseDto } from '../dto/teacher-home.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher')
export class TeacherHomeController {
  constructor(private readonly getTeacherHomeUseCase: GetTeacherHomeUseCase) {}

  @Get('home')
  @RequiredPermissions('teacher.home.view')
  @ApiOkResponse({ type: TeacherHomeResponseDto })
  getHome(): Promise<TeacherHomeResponseDto> {
    return this.getTeacherHomeUseCase.execute();
  }
}

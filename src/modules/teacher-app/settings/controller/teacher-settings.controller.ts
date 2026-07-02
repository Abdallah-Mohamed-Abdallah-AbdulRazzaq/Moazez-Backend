import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetTeacherSettingsAboutUseCase } from '../application/get-teacher-settings-about.use-case';
import { GetTeacherSettingsContactUseCase } from '../application/get-teacher-settings-contact.use-case';
import {
  TeacherSettingsAboutResponseDto,
  TeacherSettingsContactResponseDto,
} from '../dto/teacher-settings.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/settings')
export class TeacherSettingsController {
  constructor(
    private readonly getTeacherSettingsAboutUseCase: GetTeacherSettingsAboutUseCase,
    private readonly getTeacherSettingsContactUseCase: GetTeacherSettingsContactUseCase,
  ) {}

  @Get('about')
  @RequiredPermissions('teacher.settings.view')
  @ApiOkResponse({ type: TeacherSettingsAboutResponseDto })
  getAbout(): Promise<TeacherSettingsAboutResponseDto> {
    return this.getTeacherSettingsAboutUseCase.execute();
  }

  @Get('contact')
  @RequiredPermissions('teacher.settings.view')
  @ApiOkResponse({ type: TeacherSettingsContactResponseDto })
  getContact(): Promise<TeacherSettingsContactResponseDto> {
    return this.getTeacherSettingsContactUseCase.execute();
  }
}

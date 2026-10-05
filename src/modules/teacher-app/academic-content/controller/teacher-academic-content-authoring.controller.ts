import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { TeacherAcademicContentAuthoringUseCases } from '../application/teacher-academic-content-authoring.use-cases';
import {
  CreateTeacherAcademicContentDto,
  ReplaceTeacherAcademicContentTargetsDto,
} from '../dto/teacher-academic-content-authoring.dto';
import { UpdateAcademicContentDto } from '../../../academics/academic-content/dto/academic-content-request.dto';
import {
  ReplaceAcademicContentLinksDto,
  ReplaceAcademicContentTagsDto,
} from '../../../academics/academic-content/dto/academic-content-links-tags.dto';
import {
  ReplaceAcademicContentPreparationDetailDto,
  ReplaceAcademicContentWeeklyPlanDetailDto,
  ReplaceAcademicContentGuardianNoteDetailDto,
  ReplaceAcademicContentSubjectResourceDetailDto,
  ReplaceAcademicContentOnlineSessionDetailDto,
} from '../../../academics/academic-content/dto/academic-content-type-detail.dto';
import {
  presentAcademicContent,
  presentAcademicContentTargets,
  presentAcademicContentLinks,
  presentAcademicContentTags,
  presentAcademicContentReadiness,
  presentAcademicContentPreparationDetail,
  presentAcademicContentWeeklyPlanDetail,
  presentAcademicContentGuardianNoteDetail,
  presentAcademicContentSubjectResourceDetail,
  presentAcademicContentOnlineSessionDetail,
} from '../../../academics/academic-content/presenters/academic-content.presenter';
import type {
  GuardianNoteCommand,
  PreparationCommand,
  SubjectResourceCommand,
  NormalizedDetail,
} from '../../../academics/academic-content/domain/academic-content-type-detail.policy';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher')
export class TeacherAcademicContentAuthoringController {
  constructor(
    private readonly authoring: TeacherAcademicContentAuthoringUseCases,
  ) {}

  @Post('classes/:classId/academic-content')
  @RequiredPermissions('academics.academic_content.manage')
  async create(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Body() dto: CreateTeacherAcademicContentDto,
  ) {
    return presentAcademicContent(await this.authoring.create(classId, dto));
  }

  @Patch('academic-content/:contentId')
  @RequiredPermissions('academics.academic_content.manage')
  async update(
    @Param('contentId', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAcademicContentDto,
  ) {
    return presentAcademicContent(await this.authoring.update(id, dto));
  }

  @Delete('academic-content/:contentId')
  @RequiredPermissions('academics.academic_content.manage')
  async delete(@Param('contentId', new ParseUUIDPipe()) id: string) {
    await this.authoring.delete(id);
    return { ok: true };
  }

  @Post('academic-content/:contentId/archive')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.academic_content.manage')
  async archive(@Param('contentId', new ParseUUIDPipe()) id: string) {
    return presentAcademicContent(await this.authoring.archive(id));
  }

  @Post('academic-content/:contentId/restore')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.academic_content.manage')
  async restore(@Param('contentId', new ParseUUIDPipe()) id: string) {
    return presentAcademicContent(await this.authoring.restore(id));
  }

  @Put('academic-content/:contentId/targets')
  @RequiredPermissions('academics.academic_content.manage')
  async targets(
    @Param('contentId', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceTeacherAcademicContentTargetsDto,
  ) {
    return presentAcademicContentTargets(await this.authoring.targets(id, dto));
  }

  @Put('academic-content/:contentId/details/preparation')
  @RequiredPermissions('academics.academic_content.manage')
  async preparation(
    @Param('contentId', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceAcademicContentPreparationDetailDto,
  ) {
    const result = await this.authoring.preparation(id, dto);
    return presentAcademicContentPreparationDetail(
      result.state as Required<PreparationCommand>,
    );
  }

  @Put('academic-content/:contentId/details/weekly-plan')
  @RequiredPermissions('academics.academic_content.manage')
  async weeklyPlan(
    @Param('contentId', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceAcademicContentWeeklyPlanDetailDto,
  ) {
    const result = await this.authoring.weeklyPlan(id, dto);
    return presentAcademicContentWeeklyPlanDetail(
      result.state as Extract<
        NormalizedDetail,
        { type: 'WEEKLY_PLAN' }
      >['state'],
    );
  }

  @Put('academic-content/:contentId/details/guardian-note')
  @RequiredPermissions('academics.academic_content.manage')
  async guardianNote(
    @Param('contentId', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceAcademicContentGuardianNoteDetailDto,
  ) {
    const result = await this.authoring.guardianNote(id, dto);
    return presentAcademicContentGuardianNoteDetail(
      result.state as GuardianNoteCommand,
    );
  }

  @Put('academic-content/:contentId/details/subject-resource')
  @RequiredPermissions('academics.academic_content.manage')
  async subjectResource(
    @Param('contentId', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceAcademicContentSubjectResourceDetailDto,
  ) {
    const result = await this.authoring.subjectResource(id, dto);
    return presentAcademicContentSubjectResourceDetail(
      result.state as Required<SubjectResourceCommand>,
    );
  }

  @Put('academic-content/:contentId/details/online-session')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.manage')
  async onlineSession(
    @Param('contentId', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceAcademicContentOnlineSessionDetailDto,
  ) {
    const result = await this.authoring.onlineSession(id, dto);
    return presentAcademicContentOnlineSessionDetail(
      result.state as Extract<
        NormalizedDetail,
        { type: 'ONLINE_SESSION' }
      >['state'],
    );
  }

  @Put('academic-content/:contentId/links')
  @RequiredPermissions('academics.academic_content.manage')
  async links(
    @Param('contentId', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceAcademicContentLinksDto,
  ) {
    return presentAcademicContentLinks(
      await this.authoring.links(id, dto.links),
    );
  }

  @Put('academic-content/:contentId/tags')
  @RequiredPermissions('academics.academic_content.manage')
  async tags(
    @Param('contentId', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceAcademicContentTagsDto,
  ) {
    return presentAcademicContentTags(await this.authoring.tags(id, dto.tags));
  }

  @Get('academic-content/:contentId/readiness')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  async readiness(@Param('contentId', new ParseUUIDPipe()) id: string) {
    return presentAcademicContentReadiness(await this.authoring.readiness(id));
  }
}

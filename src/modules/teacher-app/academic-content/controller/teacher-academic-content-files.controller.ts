import type { Request, Response } from 'express';
import { Req, Res } from '@nestjs/common';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../../infrastructure/storage/private-media-content.response';
import { GetTeacherAcademicContentAssetContentUseCase } from '../application/teacher-academic-content-asset-content.use-case';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateAcademicContentUploadDto } from '../../../academics/academic-content/dto/academic-content-request.dto';
import {
  presentAcademicContentUploadCancel,
  presentAcademicContentUploadComplete,
  presentAcademicContentUploadIntent,
} from '../../../academics/academic-content/presenters/academic-content.presenter';
import { TeacherAcademicContentFilesUseCases } from '../application/teacher-academic-content-files.use-cases';
import {
  ListTeacherAcademicContentPreparationTemplatesQueryDto,
  TeacherAcademicContentAssetAccessQueryDto,
} from '../dto/teacher-academic-content-files.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher')
export class TeacherAcademicContentFilesController {
  constructor(
    private readonly content: GetTeacherAcademicContentAssetContentUseCase,
    private readonly files: TeacherAcademicContentFilesUseCases,
  ) {}

  @Post('academic-content/:contentId/uploads')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.manage')
  async uploadIntent(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Body() dto: CreateAcademicContentUploadDto,
    @Headers('origin') origin?: string,
  ) {
    return presentAcademicContentUploadIntent(
      await this.files.uploadIntent(contentId, dto, origin),
    );
  }

  @Post('academic-content/:contentId/uploads/:uploadId/complete')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.academic_content.manage')
  async complete(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return presentAcademicContentUploadComplete(
      await this.files.complete(contentId, uploadId),
    );
  }

  @Post('academic-content/:contentId/uploads/:uploadId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.academic_content.manage')
  async cancel(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return presentAcademicContentUploadCancel(
      await this.files.cancel(contentId, uploadId),
    );
  }

  @Delete('academic-content/:contentId/assets/:assetId')
  @RequiredPermissions('academics.academic_content.manage')
  async unlink(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    await this.files.unlink(contentId, assetId);
    return { ok: true, assetId };
  }

  @Get('academic-content/:contentId/assets/:assetId/access')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @Redirect(undefined, HttpStatus.TEMPORARY_REDIRECT)
  @RequiredPermissions('academics.academic_content.view')
  currentAccess(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Query() query: TeacherAcademicContentAssetAccessQueryDto,
  ) {
    return this.files.currentAccess(contentId, assetId, query.mode);
  }

  @Get(
    'academic-content/:contentId/revisions/:revisionId/assets/:fileId/access',
  )
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @Redirect(undefined, HttpStatus.TEMPORARY_REDIRECT)
  @RequiredPermissions('academics.academic_content.view')
  revisionAccess(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Query() query: TeacherAcademicContentAssetAccessQueryDto,
  ) {
    return this.files.revisionAccess(contentId, revisionId, fileId, query.mode);
  }

  @Get('classes/:classId/academic-content/templates/preparation')
  @RequiredPermissions('academics.academic_content.view')
  listTemplates(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Query() query: ListTeacherAcademicContentPreparationTemplatesQueryDto,
  ) {
    return this.files.listTemplates(classId, query);
  }

  @Get('classes/:classId/academic-content/templates/preparation/:templateId')
  @RequiredPermissions('academics.academic_content.view')
  templateDetail(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
  ) {
    return this.files.templateDetail(classId, templateId);
  }

  @Get('academic-content/:contentId/assets/:assetId/access/content')
  @RequiredPermissions('academics.academic_content.view')
  async currentContent(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Query() query: TeacherAcademicContentAssetAccessQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const disposition = query.mode === 'preview' ? 'inline' : 'attachment';
    const content = await this.content.current(
      contentId,
      assetId,
      query.mode,
      privateMediaContentRequest(request, response, disposition),
    );
    await streamPrivateMediaContent(content, response, disposition);
  }

  @Get(
    'academic-content/:contentId/revisions/:revisionId/assets/:fileId/access/content',
  )
  @RequiredPermissions('academics.academic_content.view')
  async revisionContent(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Query() query: TeacherAcademicContentAssetAccessQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const disposition = query.mode === 'preview' ? 'inline' : 'attachment';
    const content = await this.content.revision(
      contentId,
      revisionId,
      fileId,
      query.mode,
      privateMediaContentRequest(request, response, disposition),
    );
    await streamPrivateMediaContent(content, response, disposition);
  }
}

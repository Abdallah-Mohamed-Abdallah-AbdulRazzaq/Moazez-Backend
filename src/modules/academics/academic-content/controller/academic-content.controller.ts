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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { SchoolManagementOnly } from '../../../../common/decorators/school-management-only.decorator';
import {
  GetAcademicContentForManagementUseCase,
  ListAcademicContentForManagementUseCase,
} from '../application/academic-content-management-read.use-cases';
import { AcademicContentLifecycleUseCases } from '../application/academic-content-lifecycle.use-cases';
import { CreateAcademicContentUseCase } from '../application/create-academic-content.use-case';
import { ReplaceAcademicContentTargetsUseCase } from '../application/replace-academic-content-targets.use-case';
import {
  ReplaceAcademicContentLinksUseCase,
  ReplaceAcademicContentTagsUseCase,
} from '../application/replace-academic-content-links-tags.use-cases';
import {
  GetAcademicContentRevisionUseCase,
  ListAcademicContentRevisionsUseCase,
} from '../application/academic-content-revision.use-cases';
import {
  ReplaceAcademicContentLinksDto,
  ReplaceAcademicContentTagsDto,
} from '../dto/academic-content-links-tags.dto';
import {
  AcademicContentRevisionDetailDto,
  AcademicContentRevisionListDto,
} from '../dto/academic-content-revision-response.dto';
import {
  CancelAcademicContentUploadUseCase,
  CompleteAcademicContentUploadUseCase,
  CreateAcademicContentUploadUseCase,
  UnlinkAcademicContentAssetUseCase,
} from '../files/application/academic-content-upload.use-cases';
import {
  CreateAcademicContentDto,
  CreateAcademicContentUploadDto,
  ListAcademicContentQueryDto,
  ReplaceAcademicContentTargetsDto,
  UpdateAcademicContentDto,
} from '../dto/academic-content-request.dto';
import {
  AcademicContentAssetUnlinkResponseDto,
  AcademicContentDeleteResponseDto,
  AcademicContentDetailResponseDto,
  AcademicContentListResponseDto,
  AcademicContentResponseDto,
  AcademicContentTargetsResponseDto,
  AcademicContentLinksResponseDto,
  AcademicContentTagsResponseDto,
  AcademicContentUploadCancelResponseDto,
  AcademicContentUploadCompleteResponseDto,
  AcademicContentUploadIntentResponseDto,
} from '../dto/academic-content-response.dto';
import {
  presentAcademicContent,
  presentAcademicContentDetail,
  presentAcademicContentList,
  presentAcademicContentTargets,
  presentAcademicContentLinks,
  presentAcademicContentTags,
  presentAcademicContentRevisionList,
  presentAcademicContentRevisionDetail,
  presentAcademicContentUploadCancel,
  presentAcademicContentUploadComplete,
  presentAcademicContentUploadIntent,
} from '../presenters/academic-content.presenter';

@ApiTags('academics-academic-content')
@ApiBearerAuth()
@SchoolManagementOnly()
@Controller('academics/academic-content')
export class AcademicContentController {
  constructor(
    private readonly createContent: CreateAcademicContentUseCase,
    private readonly listContent: ListAcademicContentForManagementUseCase,
    private readonly getContent: GetAcademicContentForManagementUseCase,
    private readonly lifecycle: AcademicContentLifecycleUseCases,
    private readonly replaceTargets: ReplaceAcademicContentTargetsUseCase,
    private readonly replaceLinks: ReplaceAcademicContentLinksUseCase,
    private readonly replaceTags: ReplaceAcademicContentTagsUseCase,
    private readonly listRevisions: ListAcademicContentRevisionsUseCase,
    private readonly getRevision: GetAcademicContentRevisionUseCase,
    private readonly createUpload: CreateAcademicContentUploadUseCase,
    private readonly completeUpload: CompleteAcademicContentUploadUseCase,
    private readonly cancelUpload: CancelAcademicContentUploadUseCase,
    private readonly unlinkAsset: UnlinkAcademicContentAssetUseCase,
  ) {}

  @Post()
  @RequiredPermissions('academics.academic_content.manage')
  @ApiOperation({ summary: 'Create draft Academic Content' })
  @ApiBody({ type: CreateAcademicContentDto })
  @ApiCreatedResponse({ type: AcademicContentResponseDto })
  async create(
    @Body() dto: CreateAcademicContentDto,
  ): Promise<AcademicContentResponseDto> {
    return presentAcademicContent(await this.createContent.execute(dto));
  }

  @Get()
  @RequiredPermissions('academics.academic_content.view')
  @ApiOperation({
    summary: 'List and filter the School Academic Content Library',
  })
  @ApiOkResponse({ type: AcademicContentListResponseDto })
  async list(
    @Query() query: ListAcademicContentQueryDto,
  ): Promise<AcademicContentListResponseDto> {
    return presentAcademicContentList(await this.listContent.execute(query));
  }

  @Get(':contentId')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOperation({ summary: 'Get Academic Content management detail' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiOkResponse({ type: AcademicContentDetailResponseDto })
  async detail(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
  ): Promise<AcademicContentDetailResponseDto> {
    return presentAcademicContentDetail(
      await this.getContent.execute(contentId),
    );
  }

  @Patch(':contentId')
  @RequiredPermissions('academics.academic_content.manage')
  @ApiOperation({ summary: 'Update draft Academic Content metadata' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiBody({ type: UpdateAcademicContentDto })
  @ApiOkResponse({ type: AcademicContentResponseDto })
  async update(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Body() dto: UpdateAcademicContentDto,
  ): Promise<AcademicContentResponseDto> {
    return presentAcademicContent(await this.lifecycle.update(contentId, dto));
  }

  @Delete(':contentId')
  @RequiredPermissions('academics.academic_content.manage')
  @ApiOperation({ summary: 'Soft delete draft Academic Content' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiOkResponse({ type: AcademicContentDeleteResponseDto })
  async delete(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
  ): Promise<AcademicContentDeleteResponseDto> {
    await this.lifecycle.delete(contentId);
    return { ok: true };
  }

  @Post(':contentId/archive')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.academic_content.manage')
  @ApiOperation({ summary: 'Archive draft Academic Content' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiOkResponse({ type: AcademicContentResponseDto })
  async archive(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
  ): Promise<AcademicContentResponseDto> {
    return presentAcademicContent(await this.lifecycle.archive(contentId));
  }

  @Post(':contentId/restore')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.academic_content.manage')
  @ApiOperation({ summary: 'Restore archived Academic Content to draft' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiOkResponse({ type: AcademicContentResponseDto })
  async restore(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
  ): Promise<AcademicContentResponseDto> {
    return presentAcademicContent(await this.lifecycle.restore(contentId));
  }

  @Put(':contentId/targets')
  @RequiredPermissions('academics.academic_content.manage')
  @ApiOperation({ summary: 'Replace current Academic Content targets' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiBody({ type: ReplaceAcademicContentTargetsDto })
  @ApiOkResponse({ type: AcademicContentTargetsResponseDto })
  async targets(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Body() dto: ReplaceAcademicContentTargetsDto,
  ): Promise<AcademicContentTargetsResponseDto> {
    return presentAcademicContentTargets(
      await this.replaceTargets.execute(contentId, dto.targets),
    );
  }

  @Put(':contentId/links')
  @RequiredPermissions('academics.academic_content.manage')
  @ApiOperation({ summary: 'Replace ordered Academic Content links' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiBody({ type: ReplaceAcademicContentLinksDto })
  @ApiOkResponse({ type: AcademicContentLinksResponseDto })
  async links(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Body() dto: ReplaceAcademicContentLinksDto,
  ): Promise<AcademicContentLinksResponseDto> {
    return presentAcademicContentLinks(
      await this.replaceLinks.execute(contentId, dto.links),
    );
  }

  @Put(':contentId/tags')
  @RequiredPermissions('academics.academic_content.manage')
  @ApiOperation({ summary: 'Replace ordered Academic Content tags' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiBody({ type: ReplaceAcademicContentTagsDto })
  @ApiOkResponse({ type: AcademicContentTagsResponseDto })
  async tags(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Body() dto: ReplaceAcademicContentTagsDto,
  ): Promise<AcademicContentTagsResponseDto> {
    return presentAcademicContentTags(
      await this.replaceTags.execute(contentId, dto.tags),
    );
  }

  @Get(':contentId/revisions')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOperation({ summary: 'List Academic Content revision history' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiOkResponse({ type: AcademicContentRevisionListDto })
  async revisions(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Query() query: ListAcademicContentQueryDto,
  ): Promise<AcademicContentRevisionListDto> {
    return presentAcademicContentRevisionList(
      await this.listRevisions.execute(contentId, query),
    );
  }

  @Get(':contentId/revisions/:revisionId')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOperation({ summary: 'Read an immutable Academic Content revision' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiParam({ name: 'revisionId', format: 'uuid' })
  @ApiOkResponse({ type: AcademicContentRevisionDetailDto })
  async revisionDetail(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
  ): Promise<AcademicContentRevisionDetailDto> {
    return presentAcademicContentRevisionDetail(
      await this.getRevision.execute(contentId, revisionId),
    );
  }

  @Post(':contentId/uploads')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.manage')
  @ApiOperation({
    summary: 'Create an Academic Content resumable upload intent',
  })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiBody({ type: CreateAcademicContentUploadDto })
  @ApiCreatedResponse({ type: AcademicContentUploadIntentResponseDto })
  async uploadIntent(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Body() dto: CreateAcademicContentUploadDto,
  ): Promise<AcademicContentUploadIntentResponseDto> {
    return presentAcademicContentUploadIntent(
      await this.createUpload.execute({ contentId, ...dto }),
    );
  }

  @Post(':contentId/uploads/:uploadId/complete')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.academic_content.manage')
  @ApiOperation({ summary: 'Complete an Academic Content upload' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiParam({ name: 'uploadId', format: 'uuid' })
  @ApiOkResponse({ type: AcademicContentUploadCompleteResponseDto })
  async uploadComplete(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ): Promise<AcademicContentUploadCompleteResponseDto> {
    return presentAcademicContentUploadComplete(
      await this.completeUpload.execute({ contentId, uploadId }),
    );
  }

  @Post(':contentId/uploads/:uploadId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.academic_content.manage')
  @ApiOperation({ summary: 'Cancel an unfinished Academic Content upload' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiParam({ name: 'uploadId', format: 'uuid' })
  @ApiOkResponse({ type: AcademicContentUploadCancelResponseDto })
  async uploadCancel(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ): Promise<AcademicContentUploadCancelResponseDto> {
    return presentAcademicContentUploadCancel(
      await this.cancelUpload.execute({ contentId, uploadId }),
    );
  }

  @Delete(':contentId/assets/:assetId')
  @RequiredPermissions('academics.academic_content.manage')
  @ApiOperation({ summary: 'Unlink an Academic Content asset' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOkResponse({ type: AcademicContentAssetUnlinkResponseDto })
  async assetUnlink(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ): Promise<AcademicContentAssetUnlinkResponseDto> {
    await this.unlinkAsset.execute({ contentId, assetId });
    return { ok: true, assetId };
  }
}

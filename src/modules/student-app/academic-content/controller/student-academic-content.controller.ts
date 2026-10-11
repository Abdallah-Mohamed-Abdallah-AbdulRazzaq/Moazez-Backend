import type { Request, Response } from 'express';
import { Req, Res } from '@nestjs/common';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../../infrastructure/storage/private-media-content.response';
import { GetStudentAcademicContentAssetContentUseCase } from '../application/student-academic-content-asset-content.use-case';
import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Redirect,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  GetStudentAcademicContentUseCase,
  ListStudentAcademicContentUseCase,
  AccessStudentAcademicContentAssetUseCase,
} from '../application/student-academic-content.use-cases';
import { StudentAcademicContentQueryDto } from '../dto/student-academic-content-query.dto';
import { StudentAcademicContentAssetAccessDto } from '../dto/student-academic-content-asset-access.dto';
import {
  StudentAcademicContentDetailResponseDto,
  StudentAcademicContentListResponseDto,
} from '../dto/student-academic-content-response.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/academic-content')
export class StudentAcademicContentController {
  constructor(
    private readonly content: GetStudentAcademicContentAssetContentUseCase,
    private readonly listContent: ListStudentAcademicContentUseCase,
    private readonly getContent: GetStudentAcademicContentUseCase,
    private readonly accessAsset: AccessStudentAcademicContentAssetUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: StudentAcademicContentListResponseDto })
  list(
    @Query() query: StudentAcademicContentQueryDto,
  ): Promise<StudentAcademicContentListResponseDto> {
    return this.listContent.execute(query);
  }

  @Get(':contentId')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: StudentAcademicContentDetailResponseDto })
  detail(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
  ): Promise<StudentAcademicContentDetailResponseDto> {
    return this.getContent.execute(contentId);
  }

  @Get(':contentId/assets/:fileId/access')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @Redirect(undefined, 307)
  @ApiResponse({
    status: 307,
    description: 'Authorized private file capability',
  })
  assetAccess(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Query() query: StudentAcademicContentAssetAccessDto,
  ): Promise<{ url: string }> {
    return this.accessAsset.execute(contentId, fileId, query.mode);
  }

  @Get(':contentId/assets/:fileId/access/content')
  @RequiredPermissions('academics.academic_content.view')
  async assetContent(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Query() query: StudentAcademicContentAssetAccessDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const disposition = query.mode === 'preview' ? 'inline' : 'attachment';
    const content = await this.content.execute(
      contentId,
      fileId,
      query.mode,
      privateMediaContentRequest(request, response, disposition),
    );
    await streamPrivateMediaContent(content, response, disposition);
  }
}

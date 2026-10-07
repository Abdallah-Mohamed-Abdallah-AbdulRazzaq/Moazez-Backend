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
  GetParentAcademicContentUseCase,
  ListParentAcademicContentUseCase,
  ListParentAcademicContentAccessibleChildrenUseCase,
  AccessParentAcademicContentAssetUseCase,
} from '../application/parent-academic-content.use-cases';
import { ParentAcademicContentQueryDto } from '../dto/parent-academic-content-query.dto';
import { ParentAcademicContentAssetAccessDto } from '../dto/parent-academic-content-asset-access.dto';
import {
  ParentAcademicContentAccessibleChildrenResponseDto,
  ParentAcademicContentDetailResponseDto,
  ParentAcademicContentListResponseDto,
} from '../dto/parent-academic-content-response.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent')
export class ParentAcademicContentController {
  constructor(
    private readonly listContent: ListParentAcademicContentUseCase,
    private readonly getContent: GetParentAcademicContentUseCase,
    private readonly accessibleChildren: ListParentAcademicContentAccessibleChildrenUseCase,
    private readonly accessAsset: AccessParentAcademicContentAssetUseCase,
  ) {}
  @Get('children/:studentId/academic-content')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: ParentAcademicContentListResponseDto })
  list(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: ParentAcademicContentQueryDto,
  ): Promise<ParentAcademicContentListResponseDto> {
    return this.listContent.execute(studentId, query);
  }
  @Get('children/:studentId/academic-content/:contentId')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: ParentAcademicContentDetailResponseDto })
  detail(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
  ): Promise<ParentAcademicContentDetailResponseDto> {
    return this.getContent.execute(studentId, contentId);
  }
  @Get('academic-content/:contentId/accessible-children')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: ParentAcademicContentAccessibleChildrenResponseDto })
  listAccessibleChildren(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
  ): Promise<ParentAcademicContentAccessibleChildrenResponseDto> {
    return this.accessibleChildren.execute(contentId);
  }

  @Get('children/:studentId/academic-content/:contentId/assets/:fileId/access')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @Redirect(undefined, 307)
  @ApiResponse({
    status: 307,
    description: 'Authorized private file capability',
  })
  assetAccess(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Query() query: ParentAcademicContentAssetAccessDto,
  ): Promise<{ url: string }> {
    return this.accessAsset.execute(studentId, contentId, fileId, query.mode);
  }
}

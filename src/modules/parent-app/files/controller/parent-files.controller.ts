import { Controller, Get, Param, ParseUUIDPipe, Redirect } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTemporaryRedirectResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetParentChildFileDownloadUrlUseCase } from '../application/get-parent-child-file-download-url.use-case';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children/:studentId/files')
export class ParentFilesController {
  constructor(
    private readonly getParentChildFileDownloadUrlUseCase: GetParentChildFileDownloadUrlUseCase,
  ) {}

  @Get(':fileId/download')
  @Redirect(undefined, 307)
  @ApiOperation({
    summary:
      'Redirect a linked parent to a short-lived download URL for an owned child task proof file',
  })
  @ApiParam({ name: 'studentId', format: 'uuid' })
  @ApiParam({ name: 'fileId', format: 'uuid' })
  @ApiTemporaryRedirectResponse({
    description:
      'Redirects after verifying the file is an owned child reinforcement task proof file',
  })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid' })
  @ApiForbiddenResponse({ description: 'parent_app.actor.required_parent' })
  @ApiNotFoundResponse({ description: 'not_found' })
  @RequiredPermissions('reinforcement.submissions.view')
  async downloadChildFile(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
  ): Promise<{ url: string }> {
    return {
      url: await this.getParentChildFileDownloadUrlUseCase.execute({
        studentId,
        fileId,
      }),
    };
  }
}

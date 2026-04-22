import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Redirect,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiTags,
  ApiTemporaryRedirectResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetFileDownloadUrlUseCase } from '../application/get-file-download-url.use-case';
import { UploadFileUseCase } from '../application/upload-file.use-case';
import {
  FileRecordResponseDto,
} from '../dto/register-file-metadata.dto';
import { UploadFileRequestDto } from '../dto/upload-file-request.dto';
import { UploadedMultipartFile } from '../domain/uploaded-file';

@ApiTags('files-uploads')
@ApiBearerAuth()
@Controller('files')
export class UploadsController {
  constructor(
    private readonly uploadFileUseCase: UploadFileUseCase,
    private readonly getFileDownloadUrlUseCase: GetFileDownloadUrlUseCase,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadFileRequestDto })
  @ApiCreatedResponse({ type: FileRecordResponseDto })
  @RequiredPermissions('files.uploads.manage')
  uploadFile(
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<FileRecordResponseDto> {
    return this.uploadFileUseCase.execute(file);
  }

  @Get(':id/download')
  @Redirect(undefined, 307)
  @ApiTemporaryRedirectResponse({
    description: 'Redirects to a short-lived signed URL after authorization',
  })
  @RequiredPermissions('files.downloads.view')
  async downloadFile(
    @Param('id', new ParseUUIDPipe()) fileId: string,
  ): Promise<{ url: string }> {
    return {
      url: await this.getFileDownloadUrlUseCase.execute(fileId),
    };
  }
}

import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Redirect,
  UploadedFile,
  UseFilters,
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
import { SchoolManagementOnly } from '../../../../common/decorators/school-management-only.decorator';
import { GetFileDownloadUrlUseCase } from '../application/get-file-download-url.use-case';
import { UploadFileUseCase } from '../application/upload-file.use-case';
import { FileRecordResponseDto } from '../dto/register-file-metadata.dto';
import { UploadFileRequestDto } from '../dto/upload-file-request.dto';
import { FILES_UPLOAD_MAX_SIZE_BYTES } from '../domain/file-upload.constraints';
import { UploadedMultipartFile } from '../domain/uploaded-file';
import {
  FilesUploadMulterCodeRestorationInterceptor,
  FilesUploadMulterExceptionFilter,
} from '../filters/files-upload-multer-exception.filter';

@ApiTags('files-uploads')
@ApiBearerAuth()
@Controller('files')
export class UploadsController {
  constructor(
    private readonly uploadFileUseCase: UploadFileUseCase,
    private readonly getFileDownloadUrlUseCase: GetFileDownloadUrlUseCase,
  ) {}

  @Post()
  @UseFilters(FilesUploadMulterExceptionFilter)
  @UseInterceptors(
    FilesUploadMulterCodeRestorationInterceptor,
    FileInterceptor('file', {
      limits: { files: 1, fileSize: FILES_UPLOAD_MAX_SIZE_BYTES + 1 },
    }),
  )
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
  @SchoolManagementOnly()
  async downloadFile(
    @Param('id', new ParseUUIDPipe()) fileId: string,
  ): Promise<{ url: string }> {
    return {
      url: await this.getFileDownloadUrlUseCase.execute(fileId),
    };
  }
}

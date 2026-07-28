import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { getCurrentRequestId } from '../../../../common/context/request-context';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { SchoolManagementOnly } from '../../../../common/decorators/school-management-only.decorator';
import { releaseHttpRequestWorkLease } from '../../../../common/lifecycle/http-request-lifecycle';
import { DeleteBrandingLogoUseCase } from '../application/delete-branding-logo.use-case';
import { GetBrandingUseCase } from '../application/get-branding.use-case';
import { UpdateBrandingUseCase } from '../application/update-branding.use-case';
import { UploadBrandingLogoUseCase } from '../application/upload-branding-logo.use-case';
import { BRANDING_LOGO_MAX_SIZE_BYTES } from '../domain/branding-logo.constants';
import { BrandingLogoSizeExceededException } from '../domain/branding-logo.errors';
import { BrandingLogoMultipartFile } from '../domain/branding-logo.types';
import { BrandingResponseDto } from '../dto/branding-response.dto';
import { UpdateBrandingDto } from '../dto/update-branding.dto';
import {
  DeleteBrandingLogoDto,
  UploadBrandingLogoDto,
} from '../dto/upload-branding-logo.dto';

@Catch()
export class BrandingLogoMultipartExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    releaseHttpRequestWorkLease(request);
    const response = http.getResponse<Response>();

    if (
      isMulterFileSizeError(exception) ||
      (exception instanceof HttpException &&
        exception.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE)
    ) {
      const error = new BrandingLogoSizeExceededException(
        BRANDING_LOGO_MAX_SIZE_BYTES,
      );
      response.status(error.httpStatus).json({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          traceId: getCurrentRequestId(),
        },
      });
      return;
    }
    throw exception;
  }
}

function isMulterFileSizeError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'LIMIT_FILE_SIZE',
  );
}

@ApiTags('settings-branding')
@ApiBearerAuth()
@Controller('settings/branding')
export class BrandingController {
  constructor(
    private readonly getBrandingUseCase: GetBrandingUseCase,
    private readonly updateBrandingUseCase: UpdateBrandingUseCase,
    private readonly uploadBrandingLogoUseCase: UploadBrandingLogoUseCase,
    private readonly deleteBrandingLogoUseCase: DeleteBrandingLogoUseCase,
  ) {}

  @Get()
  @RequiredPermissions('settings.branding.view')
  getBranding(): Promise<BrandingResponseDto> {
    return this.getBrandingUseCase.execute();
  }

  @Patch()
  @RequiredPermissions('settings.branding.manage')
  updateBranding(@Body() dto: UpdateBrandingDto): Promise<BrandingResponseDto> {
    return this.updateBrandingUseCase.execute(dto);
  }

  @Post('logo')
  @HttpCode(HttpStatus.OK)
  @UseFilters(BrandingLogoMultipartExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fileSize: BRANDING_LOGO_MAX_SIZE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadBrandingLogoDto })
  @ApiOkResponse({ type: BrandingResponseDto })
  @RequiredPermissions('settings.branding.manage')
  @SchoolManagementOnly()
  uploadLogo(
    @Body() _body: UploadBrandingLogoDto,
    @UploadedFile() file: BrandingLogoMultipartFile | undefined,
  ): Promise<BrandingResponseDto> {
    return this.uploadBrandingLogoUseCase.execute(file);
  }

  @Delete('logo')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @RequiredPermissions('settings.branding.manage')
  @SchoolManagementOnly()
  async deleteLogo(@Body() _body: DeleteBrandingLogoDto): Promise<void> {
    await this.deleteBrandingLogoUseCase.execute();
  }
}

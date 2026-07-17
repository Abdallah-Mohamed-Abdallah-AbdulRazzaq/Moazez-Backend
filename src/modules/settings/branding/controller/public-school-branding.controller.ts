import {
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { PublicRoute } from '../../../../common/decorators/public-route.decorator';
import { GetPublicSchoolBrandingLogoUseCase } from '../application/get-public-school-branding-logo.use-case';
import { BRANDING_LOGO_CACHE_CONTROL } from '../domain/branding-logo.constants';
import { PublicBrandingLogoServiceUnavailableException } from '../domain/branding-logo.errors';

@ApiTags('public-school-branding')
@Controller('public/schools/:schoolId/branding')
export class PublicSchoolBrandingController {
  private readonly logger = new Logger(PublicSchoolBrandingController.name);

  constructor(
    private readonly getPublicLogo: GetPublicSchoolBrandingLogoUseCase,
  ) {}

  @Get('logo')
  @PublicRoute()
  @ApiOkResponse({
    description: 'Streams an eligible PNG or JPEG school branding logo',
  })
  @ApiNotFoundResponse({ description: 'not_found' })
  @ApiServiceUnavailableResponse({ description: 'service_unavailable' })
  async getLogo(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    let result;
    try {
      result = await this.getPublicLogo.execute(schoolId);
    } catch (error: unknown) {
      if (error instanceof PublicBrandingLogoServiceUnavailableException) {
        response.setHeader('Cache-Control', 'no-store');
        response.status(error.httpStatus).json({
          error: {
            code: error.code,
            message: error.message,
            traceId: request.header('x-trace-id') || randomUUID(),
          },
        });
        return;
      }
      throw error;
    }

    response.status(200);
    response.setHeader('Content-Type', result.mimeType);
    response.setHeader('Content-Length', String(result.sizeBytes));
    response.setHeader('Cache-Control', BRANDING_LOGO_CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', 'nosniff');

    result.stream.once('error', () => {
      this.logger.error({ event: 'branding.logo.public.stream_failed' });
      response.destroy();
    });
    result.stream.pipe(response);
  }
}

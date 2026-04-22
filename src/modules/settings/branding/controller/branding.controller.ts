import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetBrandingUseCase } from '../application/get-branding.use-case';
import { UpdateBrandingUseCase } from '../application/update-branding.use-case';
import { BrandingResponseDto } from '../dto/branding-response.dto';
import { UpdateBrandingDto } from '../dto/update-branding.dto';

@ApiTags('settings-branding')
@ApiBearerAuth()
@Controller('settings/branding')
export class BrandingController {
  constructor(
    private readonly getBrandingUseCase: GetBrandingUseCase,
    private readonly updateBrandingUseCase: UpdateBrandingUseCase,
  ) {}

  @Get()
  @RequiredPermissions('settings.branding.view')
  getBranding(): Promise<BrandingResponseDto> {
    return this.getBrandingUseCase.execute();
  }

  @Patch()
  @RequiredPermissions('settings.branding.manage')
  updateBranding(
    @Body() dto: UpdateBrandingDto,
  ): Promise<BrandingResponseDto> {
    return this.updateBrandingUseCase.execute(dto);
  }
}

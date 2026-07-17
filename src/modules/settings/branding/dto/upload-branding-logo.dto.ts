import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Allow, IsEmpty } from 'class-validator';

export class UploadBrandingLogoDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  @Allow()
  file?: unknown;
}

export class DeleteBrandingLogoDto {
  @ApiHideProperty()
  @IsEmpty()
  __empty?: never;
}

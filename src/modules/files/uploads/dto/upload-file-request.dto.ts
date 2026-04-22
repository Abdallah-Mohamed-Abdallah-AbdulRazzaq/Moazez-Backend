import { ApiProperty } from '@nestjs/swagger';

export class UploadFileRequestDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
  })
  file!: unknown;
}

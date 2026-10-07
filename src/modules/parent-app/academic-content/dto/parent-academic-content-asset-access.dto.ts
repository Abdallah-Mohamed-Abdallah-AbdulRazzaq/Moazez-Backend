import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { AcademicContentAssetAccessMode } from '../../../academics/academic-content/files/application/academic-content-authorized-file.signer';

export class ParentAcademicContentAssetAccessDto {
  @ApiProperty({ enum: ['preview', 'download'] })
  @IsIn(['preview', 'download'])
  mode!: AcademicContentAssetAccessMode;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { AcademicContentAssetAccessMode } from '../../../academics/academic-content/files/application/academic-content-authorized-file.signer';

export class StudentAcademicContentAssetAccessDto {
  @ApiProperty({ enum: ['preview', 'download'] })
  @IsIn(['preview', 'download'])
  mode!: AcademicContentAssetAccessMode;
}

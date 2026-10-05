import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ListAcademicContentPreparationTemplatesQueryDto } from '../../../academics/academic-content/dto/academic-content-preparation-template.dto';

export class TeacherAcademicContentAssetAccessQueryDto {
  @ApiProperty({ enum: ['preview', 'download'] })
  @IsIn(['preview', 'download'])
  mode!: 'preview' | 'download';
}

export class ListTeacherAcademicContentPreparationTemplatesQueryDto extends PickType(
  ListAcademicContentPreparationTemplatesQueryDto,
  ['search', 'page', 'limit'] as const,
) {}

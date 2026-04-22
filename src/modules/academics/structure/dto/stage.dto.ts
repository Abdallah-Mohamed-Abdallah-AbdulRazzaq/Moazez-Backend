import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { BaseSortableNodeDto } from './sortable-node.dto';

export class CreateStageDto extends BaseSortableNodeDto {
  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateStageDto extends CreateStageDto {}

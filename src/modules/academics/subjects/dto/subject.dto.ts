import {
  IsBoolean,
  IsHexColor,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSubjectDto {
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
  @MaxLength(60)
  code?: string | null;

  @IsOptional()
  @IsHexColor()
  color?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSubjectDto extends CreateSubjectDto {}

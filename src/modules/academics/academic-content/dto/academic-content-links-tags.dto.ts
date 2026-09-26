import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AcademicContentLinkInputDto {
  @ApiProperty({ maxLength: 180 })
  @IsString()
  @MaxLength(180)
  label!: string;

  @ApiProperty({ maxLength: 2048 })
  @IsString()
  @MaxLength(2048)
  url!: string;
}

export class ReplaceAcademicContentLinksDto {
  @ApiProperty({ type: () => AcademicContentLinkInputDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AcademicContentLinkInputDto)
  links!: AcademicContentLinkInputDto[];
}

export class AcademicContentTagInputDto {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  value!: string;
}

export class ReplaceAcademicContentTagsDto {
  @ApiProperty({ type: () => AcademicContentTagInputDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AcademicContentTagInputDto)
  tags!: AcademicContentTagInputDto[];
}

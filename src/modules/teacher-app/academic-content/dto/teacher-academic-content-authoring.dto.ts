import { ApiProperty, PickType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';
import { CreateAcademicContentDto } from '../../../academics/academic-content/dto/academic-content-request.dto';

export class CreateTeacherAcademicContentDto extends PickType(
  CreateAcademicContentDto,
  ['type', 'audience', 'title', 'description'] as const,
) {}

export class ReplaceTeacherAcademicContentTargetsDto {
  @ApiProperty({
    type: String,
    isArray: true,
    format: 'uuid',
    minItems: 1,
    maxItems: 50,
    uniqueItems: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  classIds!: string[];
}

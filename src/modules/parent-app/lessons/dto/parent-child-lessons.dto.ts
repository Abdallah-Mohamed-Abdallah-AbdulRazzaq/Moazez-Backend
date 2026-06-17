import { IsString, Matches } from 'class-validator';

const YYYY_MM_DD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ParentChildLessonsDateQueryDto {
  @IsString()
  @Matches(YYYY_MM_DD_PATTERN)
  date!: string;
}

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmStudentArrivalDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateStudentMedicalProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloodType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergies?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  conditions?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  medications?: string[];
}

export class StudentMedicalProfileResponseDto {
  id!: string;
  studentId!: string;
  allergies!: string | null;
  notes!: string | null;
  bloodType!: string | null;
  conditions!: string[];
  medications!: string[];
}

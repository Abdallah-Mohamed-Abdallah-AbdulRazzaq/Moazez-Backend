import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { APPLICANT_RELATIONSHIPS } from '../domain/applicant-profile.inputs';

export class CreateApplicantAccountDto {
  @ApiProperty({
    example: 'Nour Ali',
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @ApiProperty({ example: 'nour.parent@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 12, example: 'Applicant18BPass!' })
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiPropertyOptional({ example: '+20 100 000 0000', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'Cairo', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiProperty({ enum: APPLICANT_RELATIONSHIPS, example: 'guardian' })
  @IsString()
  @IsIn(APPLICANT_RELATIONSHIPS)
  relationship!: string;
}

export class ApplicantProfileResponseDto {
  @ApiProperty({
    description: 'Applicant profile id.',
    format: 'uuid',
  })
  applicantId!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'Nour Ali' })
  fullName!: string;

  @ApiProperty({ example: 'nour.parent@example.com' })
  email!: string;

  @ApiProperty({ example: 'nour.parent@example.com' })
  loginEmail!: string;

  @ApiProperty({ example: 'nour.parent@example.com', nullable: true })
  contactEmail!: string | null;

  @ApiProperty({ example: '+20 100 000 0000', nullable: true })
  phoneNumber!: string | null;

  @ApiProperty({ example: 'Cairo', nullable: true })
  city!: string | null;

  @ApiProperty({ enum: APPLICANT_RELATIONSHIPS, example: 'guardian' })
  relationship!: string;

  @ApiProperty({ enum: ['applicant'], example: 'applicant' })
  userType!: 'applicant';

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { UserType } from '@prisma/client';

export class AuthenticatedUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true }) username!: string | null;
  @ApiProperty() loginEmail!: string;
  @ApiProperty({ nullable: true }) contactEmail!: string | null;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ enum: UserType }) userType!: UserType;
  @ApiProperty() mustChangePassword!: boolean;
}

export class LoginResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ description: 'Access token lifetime in seconds' })
  expiresIn!: number;
  @ApiProperty({ type: AuthenticatedUserDto }) user!: AuthenticatedUserDto;
}

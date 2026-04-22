import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { PublicRoute } from '../../../../common/decorators/public-route.decorator';
import { LoginUseCase } from '../application/login.use-case';
import { LogoutUseCase } from '../application/logout.use-case';
import { MeUseCase } from '../application/me.use-case';
import { RefreshUseCase } from '../application/refresh.use-case';
import { LoginDto } from '../dto/login.dto';
import { LoginResponseDto } from '../dto/login-response.dto';
import { MeResponseDto } from '../dto/me-response.dto';
import { RefreshDto } from '../dto/refresh.dto';

type AuthedRequest = Request & { sessionId?: string };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshUseCase,
    private readonly meUseCase: MeUseCase,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  @Post('login')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for an access/refresh token pair' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'auth.credentials.invalid — wrong email or password' })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponseDto> {
    return this.loginUseCase.execute({
      email: dto.email,
      password: dto.password,
      userAgent: req.header('user-agent') ?? null,
      ipAddress: req.ip ?? null,
    });
  }

  @Post('refresh')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token for a new access/refresh pair' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid | auth.refresh.rotated' })
  refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
  ): Promise<LoginResponseDto> {
    return this.refreshUseCase.execute({
      refreshToken: dto.refreshToken,
      userAgent: req.header('user-agent') ?? null,
      ipAddress: req.ip ?? null,
    });
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated actor and active membership' })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid | auth.token.expired | auth.session.revoked' })
  me(): Promise<MeResponseDto> {
    return this.meUseCase.execute();
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session' })
  @ApiNoContentResponse({ description: 'Session revoked successfully' })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid | auth.session.revoked' })
  async logout(@Req() req: AuthedRequest): Promise<void> {
    if (req.sessionId) {
      await this.logoutUseCase.execute(req.sessionId);
    }
  }
}

import { Controller, Post, Get, Query, Body, Param, HttpCode, HttpStatus, UseGuards, Req, Request, Res, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtRequest } from '../common/interfaces/request.interface';
import type { Response } from 'express';

import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    const result = await this.authService.register(registerDto, clientIp);

    const cookie = await this.authService.getCookieWithJwtToken(
      result.user.id, result.user.email, result.user.role,
      result.user.email_verified, result.user.onboarding_completed
    );
    const refreshCookie = await this.authService.getCookieWithJwtRefreshToken(result.user.id);

    res.setHeader('Set-Cookie', [cookie, refreshCookie]);
    return {
      ...result,
      access_token: (result as any).access_token
    };
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(loginDto);

    const cookie = await this.authService.getCookieWithJwtToken(
      result.user.id, result.user.email, result.user.role,
      result.user.email_verified, result.user.onboarding_completed
    );
    const refreshCookie = await this.authService.getCookieWithJwtRefreshToken(result.user.id);

    res.setHeader('Set-Cookie', [cookie, refreshCookie]);
    return {
      ...result,
      access_token: (result as any).access_token
    };
  }

  @Post('google/mobile')
  @HttpCode(HttpStatus.OK)
  async googleMobile(@Body('accessToken') accessToken: string) {
    return this.authService.validateGoogleMobileToken(accessToken);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return this.authService.requestPasswordReset(email);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Res({ passthrough: true }) res: Response) {
    const cookies = await this.authService.getCookiesForLogOut();
    res.setHeader('Set-Cookie', cookies);
    return { message: 'Logged out successfully' };
  }

  @Get('refresh')
  async refresh(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.Refresh;
    if (!refreshToken) throw new UnauthorizedException();

    try {
      return { status: 'refresh_called' };
    } catch (e) {
      throw new UnauthorizedException();
    }
  }

  @Get('invite/:token')
  async validateInvite(@Param('token') token: string) {
    return this.authService.validateCreatorInvite(token);
  }

  @Post('invite/track-wizard-start/:token')
  async trackWizardStart(@Param('token') token: string) {
    return this.authService.trackWizardStart(token);
  }

  @Post('register-vip')
  async registerVip(@Query('token') token: string, @Body() registerDto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.registerInvitedCreator(token, registerDto);
    const cookie = await this.authService.getCookieWithJwtToken(
      result.user.id, result.user.email, result.user.role,
      result.user.email_verified, result.user.onboarding_completed
    );
    const refreshCookie = await this.authService.getCookieWithJwtRefreshToken(result.user.id);
    res.setHeader('Set-Cookie', [cookie, refreshCookie]);
    return {
      ...result,
      access_token: (result as any).access_token
    };
  }

  @Get('founding-creator/validate/:token')
  async validateFoundingCreatorToken(@Param('token') token: string) {
    return this.authService.validateFoundingToken(token);
  }

  @Post('founding-creator/register')
  async registerFoundingCreator(@Body() body: { name: string; email: string; token: string; password?: string; timezone?: string; timezoneOffset?: number }, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.registerFoundingCreator(body.name, body.email, body.token, body.password, body.timezone, body.timezoneOffset);
    const cookie = await this.authService.getCookieWithJwtToken(
      result.user.id, result.user.email, result.user.role,
      result.user.email_verified, result.user.onboarding_completed
    );
    const refreshCookie = await this.authService.getCookieWithJwtRefreshToken(result.user.id);
    res.setHeader('Set-Cookie', [cookie, refreshCookie]);
    return result;
  }

  @Post('open-access/register')
  async registerOpenAccessCreator(@Body() body: { name: string; email: string; password: string; timezone?: string; timezoneOffset?: number }, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.registerOpenAccessCreator(body.name, body.email, body.password, body.timezone, body.timezoneOffset);
    const cookie = await this.authService.getCookieWithJwtToken(
      result.user.id, result.user.email, result.user.role,
      result.user.email_verified, result.user.onboarding_completed
    );
    const refreshCookie = await this.authService.getCookieWithJwtRefreshToken(result.user.id);
    res.setHeader('Set-Cookie', [cookie, refreshCookie]);
    return result;
  }

  @Post('founding-creator/resume')
  async resumeFoundingCreator(@Body() body: { email: string; token: string }, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.resumeFoundingCreatorSession(body.email, body.token);
    const cookie = await this.authService.getCookieWithJwtToken(
      result.user.id, result.user.email, result.user.role,
      result.user.email_verified, result.user.onboarding_completed
    );
    const refreshCookie = await this.authService.getCookieWithJwtRefreshToken(result.user.id);
    res.setHeader('Set-Cookie', [cookie, refreshCookie]);
    return result;
  }

  @Post('founding-creator/validate')
  async validateFoundingToken(@Body('token') token: string) {
    return this.authService.validateFoundingToken(token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('founding-creator/claim')
  async claimFoundingToken(@Req() req: JwtRequest, @Body('token') token: string) {
    return this.authService.claimFoundingToken(req.user.userId, token);
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string, @Res() res: Response, @Req() req: any) {
    try {
      const verifiedUser = await this.authService.verifyEmailToken(token);

      const rawBaseUrl = process.env.FRONTEND_URL || 'https://app.brisbi.com';
      const baseUrl = rawBaseUrl.split(',')[0].trim();

      const { access_token } = this.authService.signToken(verifiedUser);

      const cookie = await this.authService.getCookieWithJwtToken(
        verifiedUser.id,
        verifiedUser.email,
        verifiedUser.role,
        verifiedUser.email_verified,
        verifiedUser.onboarding_completed
      );
      const refreshCookie = await this.authService.getCookieWithJwtRefreshToken(verifiedUser.id);
      res.setHeader('Set-Cookie', [cookie, refreshCookie]);

      return res.redirect(`${baseUrl}/onboarding?token=${access_token}&verified=true`);
    } catch (error) {
      const rawBaseUrl = process.env.FRONTEND_URL || 'https://app.brisbi.com';
      const baseUrl = rawBaseUrl.split(',')[0].trim();
      return res.redirect(`${baseUrl}/auth?error=verification_failed`);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('whoami')
  async whoami(@Req() req: JwtRequest) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, role: true, is_founding_creator: true, tier: true, name: true }
    });
    return {
      jwt: req.user,
      database: user,
      timestamp: new Date().toISOString()
    };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req: any) {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.validateOAuthUser(req.user, 'google');

    const cookie = await this.authService.getCookieWithJwtToken(
      result.user.id, result.user.email, result.user.role,
      result.user.email_verified, result.user.onboarding_completed
    );
    const refreshCookie = await this.authService.getCookieWithJwtRefreshToken(result.user.id);

    res.setHeader('Set-Cookie', [cookie, refreshCookie]);
    const { access_token } = this.authService.signToken(result.user);
    const baseUrl = process.env.FRONTEND_URL || 'https://app.brisbi.com';

    const isCreator = result.user.role === 'FOUNDING_CREATOR' ||
                      result.user.role === 'VERIFIED_CREATOR' ||
                      result.user.is_founding_creator === true;

    const destination = isCreator ? '/founding-creator' : '/dashboard';

    return res.redirect(`${baseUrl}/auth?token=${access_token}&user=${encodeURIComponent(JSON.stringify(result.user))}&redirect=${destination}`);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sync-session')
  async syncSession(@Req() req: JwtRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.syncSession(req.user.userId);

    const cookie = await this.authService.getCookieWithJwtToken(
        result.user.id, result.user.email, result.user.role,
        result.user.email_verified, result.user.onboarding_completed
    );
    const refreshCookie = await this.authService.getCookieWithJwtRefreshToken(result.user.id);

    res.setHeader('Set-Cookie', [cookie, refreshCookie]);
    return result;
  }

  @Post('resend-verification')
  async resend(@Body('email') email: string) {
    return this.authService.resendVerificationEmail(email);
  }

  @Post('check-verification')
  async checkVerification(@Body('email') email: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { email_verified: true, onboarding_completed: true } });
    if (!user) throw new BadRequestException('Account not found.');
    return { email_verified: user.email_verified, onboarding_completed: user.onboarding_completed };
  }

  @Get('apple')
  @UseGuards(AuthGuard('apple'))
  async appleAuth(@Req() req: any) {}

  @Post('apple/callback')
  @UseGuards(AuthGuard('apple'))
  async appleAuthRedirect(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.validateOAuthUser(req.user, 'apple');

    const cookie = await this.authService.getCookieWithJwtToken(
      result.user.id, result.user.email, result.user.role,
      result.user.email_verified, result.user.onboarding_completed
    );
    const refreshCookie = await this.authService.getCookieWithJwtRefreshToken(result.user.id);

    res.setHeader('Set-Cookie', [cookie, refreshCookie]);
    const { access_token } = this.authService.signToken(result.user);
    const baseUrl = process.env.FRONTEND_URL || 'https://app.brisbi.com';

    const isCreator = result.user.role === 'FOUNDING_CREATOR' ||
                      result.user.role === 'VERIFIED_CREATOR' ||
                      result.user.is_founding_creator === true;

    const destination = isCreator ? '/founding-creator' : '/dashboard';

    return res.redirect(`${baseUrl}/auth?token=${access_token}&user=${encodeURIComponent(JSON.stringify(result.user))}&redirect=${destination}`);
  }

  }

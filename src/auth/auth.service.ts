import { Inject, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role, VerificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChangePasswordDto, LoginDto, RegisterDto, RequestVerificationDto, VerifyCodeDto } from './auth.dto.js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(JwtService) private jwt: JwtService,
    @Inject(ConfigService) private config: ConfigService,
  ) {}

  async requestVerification(dto: RequestVerificationDto) {
    const { target, type } = this.resolvePreferredTarget(dto.email, dto.phone);
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.verificationCode.create({ data: { target, type, code, expiresAt } });
    await this.prisma.auditLog.create({ data: { eventType: 'AUTH_VERIFICATION_REQUESTED', description: `${type}:${target}` } });

    // TODO: integrate real SMS/Email provider.
    if (process.env.NODE_ENV !== 'production') {
      return { success: true, debugCode: code, expiresAt };
    }
    return { success: true, expiresAt };
  }

  async verifyCode(dto: VerifyCodeDto) {
    const { target, type } = this.resolvePreferredTarget(dto.email, dto.phone);
    const now = new Date();
    const codeRow = await this.prisma.verificationCode.findFirst({
      where: { target, type, code: dto.code, verifiedAt: null, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!codeRow) throw new BadRequestException('Invalid or expired verification code');
    await this.prisma.verificationCode.update({ where: { id: codeRow.id }, data: { verifiedAt: now } });
    await this.prisma.auditLog.create({ data: { eventType: 'AUTH_VERIFICATION_CONFIRMED', description: `${type}:${target}` } });
    return { success: true };
  }

  async register(dto: RegisterDto) {
    const { target, type: verificationType } = this.resolvePreferredTarget(dto.email, dto.phone);
    const email = dto.email?.trim() || null;
    const phone = dto.phone?.trim() || null;

    if (email) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) throw new BadRequestException('Email already in use');
    }
    if (phone) {
      const byPhone = await this.prisma.user.findUnique({ where: { phone } });
      if (byPhone) throw new BadRequestException('Phone already in use');
    }

    const verifiedCode = await this.prisma.verificationCode.findFirst({
      where: {
        target,
        type: verificationType,
        code: dto.verificationCode,
        verifiedAt: { not: null },
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!verifiedCode) throw new BadRequestException('Verification code is not confirmed');

    try {
      const passwordHash = await bcrypt.hash(dto.password, 10);
      const user = await this.prisma.user.create({
        data: { email, phone, passwordHash, role: dto.role as Role },
      });
      await this.prisma.verificationCode.update({ where: { id: verifiedCode.id }, data: { consumedAt: new Date(), userId: user.id } });
      if (dto.role === Role.ALEXITHYMIC) {
        await this.prisma.alexithymicProfile.create({ data: { userId: user.id } });
      }
      if (dto.role === Role.THERAPIST) {
        await this.prisma.therapistProfile.create({
          data: { userId: user.id, fullName: dto.fullName ?? 'Therapist', code: `T-${user.id.slice(0, 8)}` },
        });
      }
      await this.prisma.consent.create({ data: { userId: user.id, type: 'DATA_PROCESSING', version: '1.0.0' } });
      await this.prisma.auditLog.create({ data: { userId: user.id, eventType: 'AUTH_REGISTER', description: 'User registered' } });
      return { id: user.id, email: user.email, role: user.role };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Email already in use');
      }
      throw e;
    }
  }

  async login(dto: LoginDto) {
    const email = dto.email?.trim();
    const phone = dto.phone?.trim();
    if (!email && !phone) {
      throw new BadRequestException('Provide email or phone');
    }
    const user = email
      ? await this.prisma.user.findUnique({ where: { email } })
      : await this.prisma.user.findUnique({ where: { phone: phone! } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    const tokens = await this.issueTokens(user.id, user.email ?? undefined, user.phone ?? undefined, user.role);
    await this.prisma.auditLog.create({ data: { userId: user.id, eventType: 'AUTH_LOGIN' } });
    return tokens;
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, { secret: this.config.get<string>('JWT_REFRESH_SECRET') });
      return this.issueTokens(payload.sub, payload.email, payload.phone, payload.role);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.prisma.auditLog.create({ data: { userId, eventType: 'AUTH_LOGOUT' } });
    return { success: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is invalid');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.prisma.auditLog.create({ data: { userId, eventType: 'AUTH_CHANGE_PASSWORD' } });
    return { success: true };
  }

  private async issueTokens(userId: string, email: string | undefined, phone: string | undefined, role: string) {
    const payload = { sub: userId, email, phone, role };
    const accessToken = await this.jwt.signAsync(payload, { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: '15m' });
    const refreshToken = await this.jwt.signAsync(payload, { secret: this.config.get<string>('JWT_REFRESH_SECRET'), expiresIn: '30d' });
    return { accessToken, refreshToken };
  }

  private resolvePreferredTarget(email?: string, phone?: string): { target: string; type: VerificationType } {
    const e = email?.trim();
    const p = phone?.trim();
    if (!e && !p) {
      throw new BadRequestException('Provide email or phone');
    }
    // If both are provided, prefer email for verification delivery.
    if (e) return { target: e, type: VerificationType.EMAIL };
    return { target: p!, type: VerificationType.PHONE };
  }

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}

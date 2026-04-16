import { Module, Controller, Post, Body, Req, ForbiddenException, HttpException, HttpStatus, InternalServerErrorException, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { AxiosResponse } from 'axios';
import { randomUUID } from 'crypto';
import { buildAIConsultSystemPrompt } from './ai-consult-system-prompt.js';

type GigaChatTokenPayload = {
  access_token: string;
  expires_at?: number;
};

class AIConsultDto {
  @ApiProperty({ type: String, description: 'ID записи дневника', example: '2c5ef4be-2d87-4f62-babc-23f984f2be14' })
  @IsString()
  diaryEntryId!: string;

  @ApiProperty({ type: String, description: 'Промпт для AI', example: 'Помоги разобрать мои эмоции в этой ситуации.' })
  @IsString()
  prompt!: string;
}

class AIAcceptDto {
  @ApiProperty({ type: String, description: 'ID записи дневника', example: '2c5ef4be-2d87-4f62-babc-23f984f2be14' })
  @IsString()
  diaryEntryId!: string;

  @ApiProperty({ type: String, description: 'ID эмоции из каталога Emotion', example: '8d8aee17-8333-449f-a41d-f58f0af3df13' })
  @IsString()
  emotionId!: string;

  @ApiPropertyOptional({ type: Number, description: 'Уверенность AI (0..1)', example: 0.74 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

class AIRejectDto {
  @ApiProperty({ type: String, description: 'ID AI-консультации', example: '660fc15b-5f27-4e4c-b8f6-7bf59570ca72' })
  @IsString()
  consultationId!: string;
}

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
class AIController {
  private cachedToken: { token: string; expiresAtMs: number } | null = null;

  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(ConfigService) private config: ConfigService) {}

  private async getGigaChatAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAtMs - 30_000 > now) {
      return this.cachedToken.token;
    }

    const authUrl = this.config.get<string>('GIGACHAT_AUTH_URL') ?? 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
    const authorizationKey = this.config.get<string>('GIGACHAT_AUTHORIZATION_KEY');
    const scope = this.config.get<string>('GIGACHAT_SCOPE') ?? 'GIGACHAT_API_PERS';
    if (!authorizationKey) {
      throw new InternalServerErrorException('GIGACHAT_AUTHORIZATION_KEY is not configured');
    }

    const form = new URLSearchParams({ scope });
    const tokenResponse = await axios.post<GigaChatTokenPayload>(authUrl, form.toString(), {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authorizationKey}`,
        RqUID: randomUUID(),
      },
    });

    const token = tokenResponse.data.access_token;
    if (!token) {
      throw new InternalServerErrorException('GigaChat token response does not contain access_token');
    }
    const expiresAtMs = tokenResponse.data.expires_at ?? now + 29 * 60 * 1000;
    this.cachedToken = { token, expiresAtMs };
    return token;
  }

  private getChatCompletionUrls(): string[] {
    const configured = this.config.get<string>('GIGACHAT_API_URL')?.trim();
    const defaults = [
      'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
      'https://gigachat.devices.sberbank.ru/api/v1/chat/completions/',
    ];
    if (!configured) return defaults;

    const normalized = configured.replace(/\/+$/, '');
    if (normalized.endsWith('/api/v1/chat/completions')) {
      return [configured, `${normalized}/`, ...defaults].filter((v, i, a) => a.indexOf(v) === i);
    }
    if (normalized.endsWith('/api/v1')) {
      return [
        `${normalized}/chat/completions`,
        `${normalized}/chat/completions/`,
        configured,
        ...defaults,
      ].filter((v, i, a) => a.indexOf(v) === i);
    }
    return [configured, ...defaults].filter((v, i, a) => a.indexOf(v) === i);
  }

  private getNonEmptyConfig(...keys: string[]): string | undefined {
    for (const key of keys) {
      const value = this.config.get<string>(key);
      if (value && value.trim().length > 0) return value.trim();
    }
    return undefined;
  }

  @Post('consult')
  @ApiOperation({
    summary: 'AI консультация через GigaChat',
    description:
      'Модель получает системный промпт рефлексии (без диагноза, JSON: reply, emotions×5 из каталога GET /emotions, suggested_next).',
  })
  @ApiBody({ type: AIConsultDto })
  async consult(@Req() req: any, @Body() body: AIConsultDto) {
    const consent = await this.prisma.consent.findFirst({ where: { userId: req.user.sub, type: 'AI_USAGE', isActive: true } });
    if (!consent) throw new ForbiddenException('AI_USAGE consent required');
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const cnt = await this.prisma.aIConsultation.count({ where: { diaryEntry: { alexithymicId: req.user.sub }, createdAt: { gte: since } } });
    if (cnt >= 10) throw new HttpException('Limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    const model = this.getNonEmptyConfig('GIGACHAT_MODEL', 'AI_MODEL_VERSION') ?? 'GigaChat';
    const accessToken = await this.getGigaChatAccessToken();
    let response: AxiosResponse<any> | null = null;
    let lastError: unknown;
    const failed: string[] = [];
    const chatUrls = this.getChatCompletionUrls();
    for (const chatUrl of chatUrls) {
      try {
        response = await axios.post(chatUrl, {
          model,
          messages: [
            { role: 'system', content: buildAIConsultSystemPrompt() },
            { role: 'user', content: body.prompt },
          ],
          temperature: 0.7,
        }, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        });
        break;
      } catch (e) {
        lastError = e;
        if (!axios.isAxiosError(e)) throw e;
        failed.push(`${chatUrl} -> ${e.response?.status ?? 'NO_RESPONSE'}`);
        if (e.response?.status !== 404) throw e;
      }
    }
    if (!response) {
      if (axios.isAxiosError(lastError) && lastError.response?.status === 404) {
        throw new HttpException(
          `GigaChat endpoint/model not found (model=${model}). Tried: ${failed.join(', ')}`,
          HttpStatus.BAD_GATEWAY,
        );
      }
      throw lastError;
    }

    const text = JSON.stringify(response.data);
    const saved = await this.prisma.aIConsultation.create({ data: { diaryEntryId: body.diaryEntryId, prompt: body.prompt, response: text, modelVersion: model } });
    return { consultationId: saved.id, result: response.data };
  }

  @Post('accept')
  @ApiOperation({ summary: 'Принять эмоцию из AI' })
  @ApiBody({ type: AIAcceptDto })
  accept(@Body() body: AIAcceptDto) { return this.prisma.diaryEntryEmotion.create({ data: { diaryEntryId: body.diaryEntryId, emotionId: body.emotionId, confidence: body.confidence, source: 'AI' } }); }

  @Post('reject')
  @ApiOperation({ summary: 'Отклонить AI консультацию' })
  @ApiBody({ type: AIRejectDto })
  reject(@Req() req: any, @Body() body: AIRejectDto) { return this.prisma.auditLog.create({ data: { userId: req.user.sub, eventType: 'AI_REJECTED', description: `consultationId=${body.consultationId}` } }); }
}
@Module({ controllers: [AIController] })
export class AIModule {}

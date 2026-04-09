import { Module, Controller, Post, Body, Req, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Controller('ai')
class AIController {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  @Post('consult')
  async consult(@Req() req: any, @Body() body: any) {
    const consent = await this.prisma.consent.findFirst({ where: { userId: req.user.sub, type: 'AI_USAGE', isActive: true } });
    if (!consent) throw new ForbiddenException('AI_USAGE consent required');
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const cnt = await this.prisma.aIConsultation.count({ where: { diaryEntry: { alexithymicId: req.user.sub }, createdAt: { gte: since } } });
    if (cnt >= 10) throw new HttpException('Limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    const model = this.config.get<string>('AI_MODEL_VERSION') ?? 'default';
    const response = await axios.post(this.config.get<string>('AI_API_URL')!, {
      model,
      messages: [
        { role: 'system', content: 'You are a journaling assistant. Never provide medical diagnosis. Return structured JSON with at least 2 emotion interpretations.' },
        { role: 'user', content: body.prompt },
      ],
    }, { headers: { Authorization: `Bearer ${this.config.get<string>('AI_API_KEY')}` } });

    const text = JSON.stringify(response.data);
    const saved = await this.prisma.aIConsultation.create({ data: { diaryEntryId: body.diaryEntryId, prompt: body.prompt, response: text, modelVersion: model } });
    return { consultationId: saved.id, result: response.data };
  }

  @Post('accept')
  accept(@Body() body: any) { return this.prisma.diaryEntryEmotion.create({ data: { diaryEntryId: body.diaryEntryId, emotionId: body.emotionId, confidence: body.confidence, source: 'AI' } }); }

  @Post('reject')
  reject(@Req() req: any, @Body() body: any) { return this.prisma.auditLog.create({ data: { userId: req.user.sub, eventType: 'AI_REJECTED', description: `consultationId=${body.consultationId}` } }); }
}
@Module({ controllers: [AIController] })
export class AIModule {}

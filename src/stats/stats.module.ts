import { Module, Controller, Get, Query, Param, Req, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('stats')
class StatsController {
  constructor(private prisma: PrismaService) {}
  @Get('summary') summary(@Req() req: any, @Query() q: any) { return this.prisma.diaryEntry.groupBy({ by: ['emotion'], where: { alexithymicId: req.user.sub, isDeleted: false, date: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } }, _count: { emotion: true } }); }
  @Get('patterns') async patterns(@Req() req: any) {
    const topTags = await this.prisma.diaryEntry.groupBy({ by: ['tag'], where: { alexithymicId: req.user.sub, isDeleted: false }, _count: { tag: true } });
    return { topTags };
  }
  @Get('therapist/:clientId') async therapist(@Req() req: any, @Param('clientId') clientId: string) {
    const active = await this.prisma.therapistClient.findFirst({ where: { therapistId: req.user.sub, alexithymicId: clientId, status: 'ACTIVE' } });
    if (!active) throw new ForbiddenException();
    return this.prisma.diaryEntry.findMany({ where: { alexithymicId: clientId, visibility: 'THERAPIST', isDeleted: false } });
  }
}
@Module({ controllers: [StatsController] })
export class StatsModule {}

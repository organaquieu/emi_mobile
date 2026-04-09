import { Module, Controller, Get, Post, Patch, Req, Body, Param, Query, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller()
class TherapistClientsController {
  constructor(private prisma: PrismaService) {}
  @Get('therapists/search') search(@Query('code') code: string) { return this.prisma.therapistProfile.findFirst({ where: { code } }); }
  @Post('therapist-clients') link(@Req() req: any, @Body() body: any) { return this.prisma.therapistClient.create({ data: { therapistId: body.therapistId, alexithymicId: req.user.sub } }); }
  @Get('therapist-clients') list(@Req() req: any) { return this.prisma.therapistClient.findMany({ where: { OR: [{ therapistId: req.user.sub }, { alexithymicId: req.user.sub }] } }); }
  @Patch('therapist-clients/:id/status') status(@Param('id') id: string, @Body() body: any) { return this.prisma.therapistClient.update({ where: { id }, data: { status: body.status } }); }
  @Get('therapist-clients/:id/report') async report(@Req() req: any, @Param('id') id: string) {
    const link = await this.prisma.therapistClient.findUnique({ where: { id } });
    if (!link || link.therapistId !== req.user.sub) throw new ForbiddenException();
    return this.prisma.diaryEntry.findMany({ where: { alexithymicId: link.alexithymicId, visibility: 'THERAPIST', isDeleted: false } });
  }
}
@Module({ controllers: [TherapistClientsController] })
export class TherapistClientsModule {}

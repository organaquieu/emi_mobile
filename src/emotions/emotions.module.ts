import { Module, Controller, Get, Post, Patch, Body, Param, Query, ForbiddenException, Req } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('emotions')
class EmotionsController {
  constructor(private prisma: PrismaService) {}
  @Get() list(@Query('category') category?: string) { return this.prisma.emotion.findMany({ where: { ...(category ? { category: category as any } : {}) } }); }
  @Get('search') search(@Query('q') q = '') { return this.prisma.emotion.findMany({ where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } }); }
  @Post() create(@Req() req: any, @Body() body: any) { if (req.user.role !== 'ADMIN') throw new ForbiddenException(); return this.prisma.emotion.create({ data: body }); }
  @Patch(':id') update(@Req() req: any, @Param('id') id: string, @Body() body: any) { if (req.user.role !== 'ADMIN') throw new ForbiddenException(); return this.prisma.emotion.update({ where: { id }, data: body }); }
}
@Module({ controllers: [EmotionsController] })
export class EmotionsModule {}

import { Module, Controller, Get, Post, Req, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('consents')
class ConsentsController {
  constructor(private prisma: PrismaService) {}
  @Get() list(@Req() req: any) { return this.prisma.consent.findMany({ where: { userId: req.user.sub } }); }
  @Post() upsert(@Req() req: any, @Body() body: any) {
    return this.prisma.consent.upsert({ where: { userId_type: { userId: req.user.sub, type: body.type } }, update: { isActive: body.isActive ?? true, version: body.version, givenAt: new Date() }, create: { userId: req.user.sub, type: body.type, version: body.version, isActive: body.isActive ?? true } });
  }
  @Post('revoke') revoke(@Req() req: any, @Body() body: any) { return this.prisma.consent.update({ where: { userId_type: { userId: req.user.sub, type: body.type } }, data: { isActive: false } }); }
}
@Module({ controllers: [ConsentsController] })
export class ConsentsModule {}

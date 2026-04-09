import { Module, Controller, Get, Post, Patch, Delete, Req, Body, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('tags')
class TagsController {
  constructor(private prisma: PrismaService) {}
  @Get() list(@Req() req: any) { return this.prisma.userTag.findMany({ where: { userId: req.user.sub } }); }
  @Post() create(@Req() req: any, @Body() body: any) { return this.prisma.userTag.create({ data: { userId: req.user.sub, name: body.name, color: body.color } }); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any) { return this.prisma.userTag.update({ where: { id }, data: body }); }
  @Delete(':id') async remove(@Req() req: any, @Param('id') id: string) { const tag = await this.prisma.userTag.findUnique({ where: { id } }); await this.prisma.diaryEntry.updateMany({ where: { alexithymicId: req.user.sub, tag: tag?.name }, data: { tag: null } }); return this.prisma.userTag.delete({ where: { id } }); }
}
@Module({ controllers: [TagsController] })
export class TagsModule {}

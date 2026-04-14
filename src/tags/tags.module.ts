import { Body, Controller, Delete, Get, Inject, Module, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';

class CreateTagDto {
  @ApiProperty({ type: String, example: 'Работа', description: 'Название тега пользователя' })
  @IsString()
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional({ type: String, example: '#4F46E5', description: 'HEX-цвет тега' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}

class UpdateTagDto {
  @ApiPropertyOptional({ type: String, example: 'Учеба', description: 'Новое название тега' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ type: String, example: '#10B981', description: 'Новый HEX-цвет тега' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
class TagsController {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Список тегов текущего пользователя' })
  list(@Req() req: any) { return this.prisma.userTag.findMany({ where: { userId: req.user.sub } }); }

  @Post()
  @ApiOperation({ summary: 'Создать тег' })
  @ApiBody({ type: CreateTagDto })
  create(@Req() req: any, @Body() body: CreateTagDto) { return this.prisma.userTag.create({ data: { userId: req.user.sub, name: body.name, color: body.color } }); }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить тег' })
  @ApiParam({ name: 'id', type: String, description: 'ID тега' })
  @ApiBody({ type: UpdateTagDto })
  update(@Param('id') id: string, @Body() body: UpdateTagDto) { return this.prisma.userTag.update({ where: { id }, data: body }); }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить тег' })
  @ApiParam({ name: 'id', type: String, description: 'ID тега' })
  async remove(@Req() req: any, @Param('id') id: string) {
    const tag = await this.prisma.userTag.findUnique({ where: { id } });
    await this.prisma.diaryEntry.updateMany({
      where: { alexithymicId: req.user.sub, tags: tag?.name },
      data: { tags: null },
    });
    return this.prisma.userTag.delete({ where: { id } });
  }
}
@Module({ controllers: [TagsController] })
export class TagsModule {}

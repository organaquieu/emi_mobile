import { Module, Controller, Get, Post, Patch, Delete, Req, Body, Param, Query, ForbiddenException, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiPropertyOptional, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';

enum DiaryVisibilityDto {
  PRIVATE = 'PRIVATE',
  THERAPIST = 'THERAPIST',
}

class CreateDiaryEntryDto {
  @ApiPropertyOptional({ type: String, example: 'Сегодня было сложно говорить о чувствах' })
  @IsOptional()
  @IsString()
  rawText?: string;

  @ApiPropertyOptional({ type: String, example: 'Я недостаточно стараюсь' })
  @IsOptional()
  @IsString()
  thought?: string;

  @ApiPropertyOptional({ type: String, example: 'Тревога' })
  @IsOptional()
  @IsString()
  emotion?: string;

  @ApiPropertyOptional({ type: String, example: 'Избегаю общения' })
  @IsOptional()
  @IsString()
  reaction?: string;

  @ApiPropertyOptional({ type: String, example: 'work' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ enum: DiaryVisibilityDto, example: DiaryVisibilityDto.PRIVATE })
  @IsOptional()
  @IsEnum(DiaryVisibilityDto)
  visibility?: DiaryVisibilityDto;
}

class UpdateDiaryEntryDto extends CreateDiaryEntryDto {}

@ApiTags('diary')
@ApiBearerAuth()
@Controller('diary')
class DiaryEntriesController {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  @Post()
  @ApiBody({ type: () => CreateDiaryEntryDto })
  @ApiOperation({ summary: 'Create diary entry' })
  @ApiResponse({ status: 201 })
  async create(@Req() req: any, @Body() body: CreateDiaryEntryDto) {
    if (req.user.role === 'THERAPIST') throw new ForbiddenException('Therapist cannot create diary entries');
    const tag = body.thought && body.emotion && body.reaction ? 'cbt' : body.tag;
    return this.prisma.diaryEntry.create({ data: { alexithymicId: req.user.sub, rawText: body.rawText, thought: body.thought, emotion: body.emotion, reaction: body.reaction, tag, visibility: body.visibility ?? 'PRIVATE' } });
  }

  @Get()
  @ApiOperation({ summary: 'List diary entries' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'tag', required: false, type: String })
  list(@Req() req: any, @Query() query: any) {
    return this.prisma.diaryEntry.findMany({ where: { alexithymicId: req.user.sub, isDeleted: false, ...(query.tag ? { tag: query.tag } : {}) }, orderBy: { createdAt: 'desc' }, take: Number(query.limit ?? 20), skip: Number(query.offset ?? 0) });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get diary entry by id' })
  async one(@Req() req: any, @Param('id') id: string) {
    const entry = await this.prisma.diaryEntry.findUnique({ where: { id } });
    if (req.user.role === 'THERAPIST' && entry?.visibility === 'PRIVATE') throw new ForbiddenException();
    return entry;
  }

  @Patch(':id')
  @ApiBody({ type: () => UpdateDiaryEntryDto })
  @ApiOperation({ summary: 'Update diary entry' })
  update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateDiaryEntryDto) {
    if (req.user.role === 'THERAPIST') throw new ForbiddenException('Therapist cannot edit diary entries');
    return this.prisma.diaryEntry.update({ where: { id }, data: body });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete diary entry' })
  remove(@Req() req: any, @Param('id') id: string) {
    if (req.user.role === 'THERAPIST') throw new ForbiddenException('Therapist cannot delete diary entries');
    return this.prisma.diaryEntry.update({ where: { id }, data: { isDeleted: true } });
  }
}
@Module({ controllers: [DiaryEntriesController] })
export class DiaryEntriesModule {}

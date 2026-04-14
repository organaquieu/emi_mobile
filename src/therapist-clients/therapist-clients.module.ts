import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Module, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';

enum TherapistClientStatusDto {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  FINISHED = 'FINISHED',
}

class SearchTherapistQueryDto {
  @ApiProperty({ type: String, description: 'Код терапевта', example: 'THERA-12345' })
  @IsString()
  code!: string;
}

class LinkTherapistClientDto {
  @ApiProperty({ type: String, description: 'Код терапевта', example: 'T-c05c0f79' })
  @IsString()
  code!: string;
}

class UpdateTherapistClientStatusDto {
  @ApiProperty({ type: String, enum: TherapistClientStatusDto, example: TherapistClientStatusDto.PAUSED })
  @IsEnum(TherapistClientStatusDto)
  status!: TherapistClientStatusDto;
}

@ApiTags('therapist-clients')
@ApiBearerAuth()
@Controller()
class TherapistClientsController {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  @Get('therapists/me/code')
  @ApiOperation({ summary: 'Получить свой код терапевта (для передачи клиенту)' })
  async myCode(@Req() req: any) {
    if (req.user.role !== 'THERAPIST') {
      throw new ForbiddenException('Only therapist can request therapist code');
    }
    const profile = await this.prisma.therapistProfile.findUnique({
      where: { userId: req.user.sub },
      select: { code: true, fullName: true, userId: true },
    });
    if (!profile) throw new NotFoundException('Therapist profile not found');
    return profile;
  }

  @Get('therapists/search')
  @ApiOperation({ summary: 'Найти терапевта по коду' })
  @ApiQuery({ name: 'code', type: String, required: true, description: 'Код терапевта' })
  search(@Query() query: SearchTherapistQueryDto) { return this.prisma.therapistProfile.findFirst({ where: { code: query.code } }); }

  @Post('therapist-clients')
  @ApiOperation({ summary: 'Клиент отправляет запрос на привязку к терапевту по коду' })
  @ApiBody({ type: LinkTherapistClientDto })
  async link(@Req() req: any, @Body() body: LinkTherapistClientDto) {
    if (req.user.role !== 'ALEXITHYMIC') throw new ForbiddenException('Only client can link to therapist');
    const code = body.code?.trim();
    if (!code) throw new BadRequestException('code is required');
    const therapist = await this.prisma.therapistProfile.findUnique({ where: { code } });
    if (!therapist) throw new NotFoundException('Therapist with this code not found');
    return this.prisma.therapistClient.create({ data: { therapistId: therapist.userId, alexithymicId: req.user.sub } });
  }

  @Get('therapist-clients')
  @ApiOperation({ summary: 'Список связок терапевт-клиент для текущего пользователя' })
  list(@Req() req: any) { return this.prisma.therapistClient.findMany({ where: { OR: [{ therapistId: req.user.sub }, { alexithymicId: req.user.sub }] } }); }

  @Patch('therapist-clients/:id/status')
  @ApiOperation({ summary: 'Изменить статус связки (ACTIVE/PAUSED/FINISHED)' })
  @ApiParam({ name: 'id', type: String, description: 'ID связки therapistClient' })
  @ApiBody({ type: UpdateTherapistClientStatusDto })
  status(@Param('id') id: string, @Body() body: UpdateTherapistClientStatusDto) { return this.prisma.therapistClient.update({ where: { id }, data: { status: body.status } }); }

  @Get('therapist-clients/:id/report')
  @ApiOperation({ summary: 'Отчёт по дневнику клиента для терапевта (только visibility=THERAPIST)' })
  @ApiParam({ name: 'id', type: String, description: 'ID связки therapistClient' })
  async report(@Req() req: any, @Param('id') id: string) {
    const link = await this.prisma.therapistClient.findUnique({ where: { id } });
    if (!link || link.therapistId !== req.user.sub) throw new ForbiddenException();
    return this.prisma.diaryEntry.findMany({ where: { alexithymicId: link.alexithymicId, visibility: 'THERAPIST', isDeleted: false } });
  }
}
@Module({ controllers: [TherapistClientsController] })
export class TherapistClientsModule {}

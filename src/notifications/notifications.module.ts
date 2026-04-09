import { Module, Controller, Get, Patch, Req, Body } from '@nestjs/common';

const settings = new Map<string, any>();

@Controller('notifications')
class NotificationsController {
  @Get('settings') get(@Req() req: any) { return settings.get(req.user.sub) ?? { enabled: true, frequency: 'daily', time: '09:00' }; }
  @Patch('settings') patch(@Req() req: any, @Body() body: any) { const current = settings.get(req.user.sub) ?? { enabled: true, frequency: 'daily', time: '09:00' }; const next = { ...current, ...body }; settings.set(req.user.sub, next); return next; }
}
@Module({ controllers: [NotificationsController] })
export class NotificationsModule {}

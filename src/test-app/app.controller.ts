import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHello(): string {
    return 'Hello! Telemetry is active.';
  }

  @Get('/test-route')
  getTest(): object {
    console.log('Test route hit!');
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
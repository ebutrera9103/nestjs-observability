import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { TelemetryModule } from '../lib/telemetry.module';

@Module({
  imports: [TelemetryModule],
  controllers: [AppController],
})
export class AppModule {}

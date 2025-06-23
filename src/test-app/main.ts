import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initOpenTelemetry } from '../lib/common/telemetry-config/opentelemetry.config';

async function bootstrap() {
  initOpenTelemetry('isolated-telemetry-test-app');
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();

import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TelemetryInterceptor } from './common/interceptors/telemetry.interceptor';
import { RequestContextService } from './common/context/request-context';

@Global()
@Module({
  providers: [
    RequestContextService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TelemetryInterceptor,
    },
  ],
  exports: [RequestContextService],
})
export class TelemetryModule {}

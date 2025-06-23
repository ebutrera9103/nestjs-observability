/**
 * This is the main entry point for the @secretsy/nestjs-observability package.
 * It explicitly exports all public-facing modules, services, and functions.
 */

import { TelemetryModule } from './telemetry.module';
import { RequestContextService } from './common/context/request-context';
import { initOpenTelemetry } from './common/telemetry-config/opentelemetry.config';

export { TelemetryModule, RequestContextService, initOpenTelemetry };

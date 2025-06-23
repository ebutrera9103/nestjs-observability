import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { credentials } from '@grpc/grpc-js';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export const initOpenTelemetry = (serviceName: string) => {
  const traceExporter = new OTLPTraceExporter({
    credentials: credentials.createInsecure(),
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      new GraphQLInstrumentation({
        depth: 10,
        mergeItems: true,
        ignoreTrivialResolveSpans: false,
        // The responseHook has been removed.
        // User attributes will now be added via the TelemetryInterceptor.
      }),
    ],
  });

  try {
    sdk.start();
    console.log(
      'OpenTelemetry SDK started successfully. User attributes will be handled by TelemetryInterceptor.'
    );
  } catch (error) {
    console.error('Error starting OpenTelemetry SDK:', error);
  }

  process.on('SIGTERM', () => {
    sdk.shutdown();
  });

  return sdk;
};

Of course\! Here is the content of the README in plain Markdown format for you to copy.

````markdown
# NestJS Observability Module

A shared NestJS module that provides out-of-the-box observability using **OpenTelemetry**. This module automatically instruments your application to generate and export distributed traces, giving you deep insights into your microservices architecture.

## Features

- **Zero-Configuration Tracing:** Automatically traces all incoming HTTP and GraphQL requests.
- **Distributed Context Propagation:** Seamlessly propagates trace context across service boundaries.
- **Rich Metadata:** Enriches traces with useful metadata like HTTP routes, status codes, and user information from JWTs.
- **Custom Span Support:** Provides a simple service to create custom child spans for fine-grained performance monitoring of your business logic.
- **Standardized:** Built on OpenTelemetry, the industry standard for observability.

## 1. Installation

This module is hosted in a private AWS CodeArtifact repository. Before you can install it, you must configure your local environment to authenticate with AWS.

### Step 1.1: Authenticate with AWS

> **Prerequisite:** You must have the [AWS CLI](https://aws.amazon.com/cli/) installed and configured with valid credentials.

In your terminal, run the following command to log in to the CodeArtifact NPM registry. This command only needs to be run once per 12-hour session.

```bash
aws codeartifact login --tool npm --repository nestjs-private-packages --domain secretsy --scope @secretsy
```
````

### Step 1.2: Install the Package

Once authenticated, install the module into your NestJS project using npm.

```bash
npm install @secretsy/nestjs-observability
```

## 2\. Quick Start

To enable tracing across your entire application, import the `TelemetryModule` into your root `AppModule`.

```typescript
// src/app.module.ts

import { Module } from '@nestjs/common';
import { TelemetryModule } from '@secretsy/nestjs-observability';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Import the TelemetryModule here
    TelemetryModule,
    // ... your other modules
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

## 3\. Configuration

The module's behavior is configured through environment variables.

### Step 3.1: Initialize the SDK

For the module to work, you **must** initialize the OpenTelemetry SDK in your application's entrypoint file (`src/main.ts`). This ensures that tracing is active _before_ any other part of your application starts.

```typescript
// src/main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// Import the initialization function
import { initOpenTelemetry } from '@secretsy/nestjs-observability';

async function bootstrap() {
  // Call the initialization function first, providing a service name.
  // This name will identify your service in observability platforms like Jaeger or Honeycomb.
  initOpenTelemetry('my-awesome-nestjs-service');

  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

### Step 3.2: Configure the Collector Endpoint

The SDK needs to know where to send its trace data. Provide the address of your OpenTelemetry Collector via the following environment variable.

Create a `.env` file in the root of your project:

```env
# .env

# This should point to your OpenTelemetry Collector's gRPC endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=otel-collector:4317
```

With these steps complete, your application will automatically be traced.

## 4\. Advanced Usage: Creating Custom Spans

While the module automatically traces incoming requests, you may want to measure the performance of specific functions or operations within your business logic. You can achieve this by creating custom "child spans".

### Step 4.1: Inject the `RequestContextService`

The `RequestContextService` provides a `startSpan` method to easily create and manage child spans. Inject it into any service where you need custom tracing.

```typescript
// src/my-feature/my-feature.service.ts

import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@secretsy/nestjs-observability';

@Injectable()
export class MyFeatureService {
  constructor(
    // Inject the service
    private readonly telemetryContext: RequestContextService
  ) {}

  async doComplexWork(userId: string): Promise<any> {
    // Use the startSpan method to wrap your operation
    return this.telemetryContext.startSpan('doComplexWork', async (span) => {
      // 'span' is the newly created child span.
      // You can add custom attributes for context and filtering.
      span.setAttribute('app.user.id', userId);
      span.addEvent('Starting database query...');

      // --- Your complex business logic here ---
      const result = await this.database.find({ user: userId });
      await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate work
      // ---

      span.addEvent('Database query finished.');
      span.setAttribute('app.items.found', result.length);

      return result;
    });
  }
}
```

This will create a new span named `doComplexWork` inside the main request trace, giving you a precise measurement of how long your specific operation took.

```

```

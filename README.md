# NestJS Observability Module

A shared NestJS module that provides out-of-the-box observability using **OpenTelemetry**. This module automatically instruments your application to generate and export distributed traces, giving you deep insights into your microservices architecture.

## Features

- **Zero-Configuration Tracing:** Automatically traces all incoming HTTP and GraphQL requests.
- **Distributed Context Propagation:** Seamlessly propagates trace context across service boundaries.
- **Rich Metadata:** Enriches traces with useful metadata like HTTP routes, status codes, and user information from JWTs.
- **Custom Span Support:** Provides a simple service to create custom child spans for fine-grained performance monitoring of your business logic.
- **Standardized:** Built on OpenTelemetry, the industry standard for observability.

---

## Initial Setup: Early SDK Initialization

For comprehensive tracing, the OpenTelemetry SDK must be initialized **before** your NestJS application fully bootstraps. This ensures that all components, even those loaded very early, are properly instrumented. This is achieved by using Node.js's `--require` flag to load a dedicated TypeScript file containing the SDK initialization logic.

### 0.1: Prepare the Telemetry Initialization File

**Create a new folder named `telemetry` in the root of your service** (next to `package.json`). Inside this folder, create a file named `init.ts`. This file will contain the minimal code to initialize the OpenTelemetry SDK.

```typescript
// telemetry/init.ts (in your service root, e.g., TF-USER/telemetry/init.ts)

import { initOpenTelemetry } from '@secretsy/nestjs-observability';

console.log('--- [Tracing Loader] Initializing OpenTelemetry Tracing ---');

// Initialize tracing for your microservice.
// Replace 'user-microservice' with the actual name of your service.
initOpenTelemetry('user-microservice');
```

### 0.2: Configure `package.json` Scripts

Modify your `package.json` scripts to ensure `telemetry/init.ts` (or its compiled counterpart) is executed at the correct time for both development and production environments.

```json
// package.json

{
  "scripts": {
    // ... other scripts

    // Build script: Ensure telemetry/init.ts is compiled alongside your app.
    // This command compiles init.ts to dist/telemetry/init.js
    // and then builds your 'user' NestJS project.
    "build": "tsc telemetry/init.ts --outDir dist/telemetry && nest build user",

    // Production script: Uses Node.js's --require flag to load the compiled
    // init.js before starting the main application.
    "start:prod": "node --require ./dist/telemetry/init.js dist/app/main.js",

    // A convenience script to run your production build.
    "user": "npm run start:prod"

    // ... rest of your scripts
  }
}
```
---

## 1\. Installation

This module is hosted in our private package registry [inside Gitlab](https://gitlab.topfollowers.com/fanatyx/nestjs-observability/-/packages/). Before you can install it, you must configure your local environment to authenticate with Gitlab.

### Step 1.1: Authenticate with Gitlab

> **Prerequisite:** You must have a [gitlab token](https://gitlab.topfollowers.com/-/user_settings/personal_access_tokens ) installed and configured with valid credentials.

In your terminal, run the following command to log in to the NPM registry. This command only needs to be run once until the token expires.

```bash
  sudo cat <<EOF > ~/.npmrc
# Default registry for most packages
registry=https://registry.npmjs.org/
# Scope for your private packages, directing them to GitLab
@fanatyx:registry=https://gitlab.topfollowers.com/api/v4/packages/npm/
# Authentication token for your GitLab registry
//gitlab.topfollowers.com/api/v4/packages/npm/:_authToken=YOUR_GITLAB_AUTH_TOKEN
# more here https://gitlab.topfollowers.com/help/user/packages/npm_registry/index
EOF
```

### Step 1.2: Install the Package

Once authenticated, install the module into your NestJS project using npm.

```bash
npm install @fanatyx/nestjs-observability
```

---

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

---

## 3\. Configuration

The module's behavior is configured through environment variables.

### Step 3.1: Initialize the SDK

For the module to work, you **must** initialize the OpenTelemetry SDK in your application's entrypoint file (`src/main.ts`). This ensures that tracing is active _before_ any other part of your application starts.

```typescript
// src/main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// Import the initialization function
// import { initOpenTelemetry } from '@secretsy/nestjs-observability'; // This import might become redundant

async function bootstrap() {
  // Call the initialization function first, providing a service name.
  // This name will identify your service in observability platforms like Jaeger or Honeycomb.
  // NOTE: This step is now primarily handled by the 'telemetry/init.ts' file and package.json scripts.
  // You can safely remove the 'initOpenTelemetry' call from here if 'telemetry/init.ts'
  // is configured to handle all SDK initialization.
  // initOpenTelemetry('my-awesome-nestjs-service'); // Consider removing this line if telemetry/init.ts handles it.

  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

### Step 3.2: Configure the Collector Endpoint

The SDK needs to know where to send its trace data. Provide the address of your OpenTelemetry Collector via an environment variable. Typically, this would point to a central collector in your staging or production environment.

```env
# In your environment
OTEL_EXPORTER_OTLP_ENDPOINT=my-central-collector.my-domain.com:4317
```

---

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

---

## 5\. For Module Developers: Local Testing Environment

This section is for developers who are **contributing to this module**. The following files are included in this repository to provide a self-contained environment for testing the module's functionality locally.

### Step 5.1: Repository Files

This repository contains the following configuration files to run the included test application (`src/test-app`) and a local observability stack:

- `docker-compose.yml`: Defines the test application, Jaeger, and Collector services.
- `Dockerfile`: Instructs Docker how to build the test application.
- `otel-collector-config.yaml`: Configures the OpenTelemetry Collector.

**`docker-compose.yml`**

```yaml
version: '3.8'

networks:
  observability-net:

services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    container_name: jaeger
    ports:
      - '16686:16686'
    networks:
      - observability-net

  otel-collector:
    image: otel/opentelemetry-collector:latest
    container_name: otel-collector
    command: ['--config=/etc/otel-collector-config.yaml']
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - '4317:4317'
    depends_on:
      - jaeger
    networks:
      - observability-net

  nestjs-app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: nestjs-app
    ports:
      - '3000:3000'
    environment:
      - OTEL_EXPORTER_OTLP_ENDPOINT=otel-collector:4317
    depends_on:
      - otel-collector
    networks:
      - observability-net
```

**`otel-collector-config.yaml`**

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317

exporters:
  otlphttp:
    endpoint: http://jaeger:4318

processors:
  batch:

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp]
```

### Step 5.2: Running the Local Test Environment

From the root of this repository, run the following command:

```bash
docker-compose up -d --build
```

This will build and start the test application, the collector, and Jaeger.

### Step 5.3: Viewing Traces

1.  Make a few API requests to the test application: `http://localhost:3000/test-route`
2.  Open the Jaeger UI in your browser: **[http://localhost:16686](https://www.google.com/search?q=http://localhost:16686)**
3.  Select the `isolated-telemetry-test-app` service from the dropdown and click "Find Traces".

# @fanatyx/nestjs-observability

A shared NestJS module that provides out-of-the-box distributed tracing and observability using **OpenTelemetry**. Automatically instruments your application to generate and export distributed traces, giving you deep insights into your microservices architecture.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Integration Guide](#integration-guide)
- [Integration Example](docs/INTEGRATION_EXAMPLE.md)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Advanced Usage: Custom Spans](#advanced-usage-custom-spans)
- [Local Development](#local-development)
- [License](#license)

## Features

- **Zero-Configuration Tracing** — Automatically traces all incoming HTTP and GraphQL requests.
- **Distributed Context Propagation** — Seamlessly propagates trace context across service boundaries.
- **Rich Metadata** — Enriches traces with HTTP routes, status codes, and user information from JWTs.
- **Custom Span Support** — Provides a simple service to create custom child spans for fine-grained performance monitoring.
- **Standardized** — Built on [OpenTelemetry](https://opentelemetry.io/), the industry standard for observability.

## Prerequisites

- **Node.js** >= 18
- **NestJS** >= 10
- An **OpenTelemetry Collector** endpoint (e.g., [Jaeger](https://www.jaegertracing.io/), [Grafana Tempo](https://grafana.com/oss/tempo/))

## Installation

### 1. Authenticate with the private registry

This module is hosted on a [private GitLab NPM registry](https://gitlab.topfollowers.com/fanatyx/nestjs-observability/-/packages/). Configure your `.npmrc` to authenticate:

```bash
cat <<EOF >> ~/.npmrc
@fanatyx:registry=https://gitlab.topfollowers.com/api/v4/packages/npm/
//gitlab.topfollowers.com/api/v4/packages/npm/:_authToken=YOUR_GITLAB_AUTH_TOKEN
EOF
```

> **Note:** You need a [GitLab personal access token](https://gitlab.topfollowers.com/-/user_settings/personal_access_tokens) with `read_api` scope. This only needs to be done once.

### 2. Install the package

```bash
npm install @fanatyx/nestjs-observability
```

## Integration Guide

Follow these 4 steps to add observability to your NestJS service.

### Step 1 — Create the telemetry init file

OpenTelemetry must hook into Node.js **before** your application code loads (so it can patch `http`, `express`, etc.). Create this file at the root of your project:

```
my-service/
├── telemetry/
│   └── init.ts        <-- create this
├── src/
│   ├── app.module.ts
│   └── main.ts
├── package.json
└── tsconfig.json
```

```typescript
// telemetry/init.ts

import { initOpenTelemetry } from '@fanatyx/nestjs-observability';

// Use your service name — this is how it appears in Jaeger/Tempo.
initOpenTelemetry('my-service-name');
```

### Step 2 — Update build and start scripts

The init file must be compiled separately (it lives outside `src/`) and loaded via Node.js's `--require` flag so it runs **before** your app:

```json
{
  "scripts": {
    "build": "tsc telemetry/init.ts --outDir dist/telemetry && nest build",
    "start:prod": "node --require ./dist/telemetry/init.js dist/main.js"
  }
}
```

> **Why `--require`?** OpenTelemetry works by monkey-patching Node.js modules (`http`, `express`, etc.) at import time. If your app imports these modules before the SDK initializes, those imports won't be instrumented. `--require` guarantees the SDK loads first.

### Step 3 — Import TelemetryModule

Add `TelemetryModule` to your root `AppModule`. It's a global module, so you only need to import it once:

```typescript
// src/app.module.ts

import { Module } from '@nestjs/common';
import { TelemetryModule } from '@fanatyx/nestjs-observability';

@Module({
  imports: [
    TelemetryModule,
    // ... your other modules
  ],
})
export class AppModule {}
```

### Step 4 — Set the collector endpoint

Tell the SDK where to send traces by setting this environment variable (gRPC address of your OpenTelemetry Collector):

```env
OTEL_EXPORTER_OTLP_ENDPOINT=my-collector:4317
```

Set this in your `.env`, Docker Compose, Kubernetes manifest, or however you manage environment variables.

### Verify it works

Start your service, make a few requests, and check your tracing backend (Jaeger, Tempo, etc.). You should see spans for every HTTP/GraphQL request with your service name.

```bash
# Build and start
npm run build
npm run start:prod

# In another terminal
curl http://localhost:3000/any-route
```

If you see `OpenTelemetry SDK started successfully` in your logs, tracing is active.

> **Want a full, realistic example?** See the [Integration Example](docs/INTEGRATION_EXAMPLE.md) guide — it walks through a complete User Service with custom spans, controller setup, and Jaeger traces.

## Configuration

### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | gRPC address of your OpenTelemetry Collector | `my-collector:4317` |

### What gets instrumented automatically

| Layer | Instrumentation |
|---|---|
| HTTP | Request method, URL, status code, headers |
| Express | Middleware and route handler timing |
| NestJS | Controller and handler resolution |
| GraphQL | Query/mutation resolver execution (depth: 10) |

### User enrichment

The `TelemetryInterceptor` automatically extracts user information from the request object (populated by your auth guard) and adds it to spans:

- `app.user.id` — from `req.user._id` or `req.user.sub`
- `app.user.username` — from `req.user.username`

This works for both HTTP and GraphQL contexts.

## API Reference

### `initOpenTelemetry(serviceName: string)`

Initializes the OpenTelemetry SDK with pre-configured instrumentations. **Must be called before NestJS bootstraps** (via `--require` flag).

- **serviceName** — Identifies your service in tracing backends (e.g., Jaeger).
- **Returns** — The `NodeSDK` instance.
- Registers a `SIGTERM` handler for graceful shutdown.

### `TelemetryModule`

A `@Global()` NestJS module. Import it once in your root `AppModule` — it becomes available everywhere.

**Provides:**

- `RequestContextService` — Exported for injection into your services.
- `TelemetryInterceptor` — Registered as a global `APP_INTERCEPTOR` (automatic).

### `RequestContextService`

An `@Injectable()` service with `REQUEST` scope for managing trace context.

**Properties:**

| Property | Type | Description |
|---|---|---|
| `activeContext` | `Context` | The current OpenTelemetry context |
| `activeSpan` | `Span \| undefined` | The current active span |

**Methods:**

| Method | Description |
|---|---|
| `getTracer(name, version?)` | Returns an OpenTelemetry `Tracer` instance |
| `withContext(context, fn)` | Executes a function within a specific OpenTelemetry context |
| `startSpan(name, fn, options?)` | Creates a child span, executes `fn` with it, and handles status/errors automatically |

## Advanced Usage: Custom Spans

Inject `RequestContextService` to create child spans for measuring specific operations:

```typescript
import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@fanatyx/nestjs-observability';

@Injectable()
export class OrderService {
  constructor(private readonly telemetry: RequestContextService) {}

  async processOrder(orderId: string): Promise<Order> {
    return this.telemetry.startSpan('processOrder', async (span) => {
      span.setAttribute('app.order.id', orderId);
      span.addEvent('Validating order');

      const order = await this.validateAndSave(orderId);

      span.setAttribute('app.order.total', order.total);
      return order;
    });
  }
}
```

The span is automatically:
- Set to `OK` status on success
- Set to `ERROR` status with exception recording on failure
- Ended in a `finally` block (always cleaned up)

## Local Development

This section is for **contributors to this module**. The repository includes a complete local observability stack for testing.

### Running the stack

```bash
docker compose up -d --build
```

This starts:

| Service | Port | Description |
|---|---|---|
| **nestjs-app** | `3000` | Test NestJS application |
| **otel-collector** | `4317` (gRPC), `4318` (HTTP) | OpenTelemetry Collector |
| **jaeger** | `16686` | Tracing UI |
| **traefik** | `8080` | Reverse proxy |

### Viewing traces

1. Make a request to the test app:
   ```bash
   curl http://localhost:3000/test-route
   ```
2. Open Jaeger UI at http://localhost:16686
3. Select the `isolated-telemetry-test-app` service and click **Find Traces**

### Project structure

```
src/
├── lib/                              # Published library
│   ├── index.ts                      # Public exports
│   ├── telemetry.module.ts           # Global NestJS module
│   └── common/
│       ├── context/
│       │   └── request-context.ts    # RequestContextService
│       ├── interceptors/
│       │   └── telemetry.interceptor.ts
│       └── telemetry-config/
│           └── opentelemetry.config.ts
└── test-app/                         # Local test application
    ├── main.ts
    ├── app.module.ts
    └── app.controller.ts
```

## License

MIT

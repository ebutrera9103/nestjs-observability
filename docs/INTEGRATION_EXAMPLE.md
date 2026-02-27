# Integration Example: User Service

This guide walks through adding distributed tracing to a real NestJS REST API from scratch. By the end, you'll have automatic HTTP tracing, custom spans in your business logic, and traces flowing into Jaeger.

## Table of Contents

- [Scenario](#scenario)
- [Project Structure](#project-structure)
- [Step-by-Step Integration](#step-by-step-integration)
- [Adding Custom Spans](#adding-custom-spans)
- [Controller Example](#controller-example)
- [What You'll See in Jaeger](#what-youll-see-in-jaeger)
- [Troubleshooting](#troubleshooting)

## Scenario

You have a NestJS REST API called **user-service** that manages user accounts. It exposes endpoints like `GET /users/:id` and `POST /users`. You want to:

1. Trace every incoming HTTP request automatically
2. Add custom spans around database lookups to measure query performance
3. See the full request waterfall in Jaeger

## Project Structure

After integration, your project will look like this:

```
user-service/
├── telemetry/
│   └── init.ts                # OpenTelemetry SDK bootstrap (runs before app)
├── src/
│   ├── app.module.ts          # Root module — imports TelemetryModule
│   ├── main.ts                # NestJS bootstrap
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── user.entity.ts
│   └── auth/
│       └── auth.module.ts
├── .env
├── package.json
└── tsconfig.json
```

The only files that touch observability are:
- `telemetry/init.ts` — SDK initialization
- `src/app.module.ts` — module import
- `src/users/users.service.ts` — custom spans (optional)

Everything else stays untouched.

## Step-by-Step Integration

### Step 1 — Install the package

> **Note:** The `@fanatyx/nestjs-observability` package is private. See the [Installation](../README.md#installation) section in the README for how to install it locally or publish it under your own scope.

```bash
npm install @fanatyx/nestjs-observability
```

### Step 2 — Create the telemetry init file

Create `telemetry/init.ts` at the project root (outside `src/`):

```typescript
// telemetry/init.ts

import { initOpenTelemetry } from '@fanatyx/nestjs-observability';

initOpenTelemetry('user-service');
```

This bootstraps the OpenTelemetry SDK with automatic instrumentation for HTTP, Express, NestJS, and GraphQL. The string `'user-service'` is how your service will appear in Jaeger.

### Step 3 — Update build and start scripts

The init file lives outside `src/`, so it needs to be compiled separately. Update your `package.json` scripts:

```json
{
  "name": "user-service",
  "scripts": {
    "build": "tsc telemetry/init.ts --outDir dist/telemetry && nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node --require ./dist/telemetry/init.js dist/main.js"
  }
}
```

The `--require` flag tells Node.js to load the telemetry file **before** your application code. This is critical — OpenTelemetry works by monkey-patching modules like `http` and `express` at import time. If your app imports them first, those imports won't be instrumented.

### Step 4 — Import TelemetryModule

Add `TelemetryModule` to your root `AppModule`. It's a `@Global()` module, so you only need to import it once:

```typescript
// src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelemetryModule } from '@fanatyx/nestjs-observability';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TelemetryModule,
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
```

That's it — no configuration, no `forRoot()` options. `TelemetryModule` automatically registers a global interceptor that traces every incoming request.

### Step 5 — Set the collector endpoint

Add the OpenTelemetry Collector address to your `.env` file:

```env
# .env

OTEL_EXPORTER_OTLP_ENDPOINT=localhost:4317
```

This is the gRPC address of your OpenTelemetry Collector. If you're running Jaeger locally with Docker, a typical setup is:

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4317:4317 \
  jaegertracing/all-in-one:latest
```

### Verify it works

Build and start the service:

```bash
npm run build
npm run start:prod
```

You should see `OpenTelemetry SDK started successfully` in the console. Make a request and check Jaeger:

```bash
curl http://localhost:3000/users/1
```

Open [http://localhost:16686](http://localhost:16686), select the **user-service** service, and click **Find Traces**. You should see a trace for the request you just made.

## Adding Custom Spans

Automatic instrumentation covers HTTP and NestJS layers, but you'll often want to trace specific operations — like a database query or an external API call. Use `RequestContextService` for this.

Here's a realistic `UsersService` with custom spans:

```typescript
// src/users/users.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestContextService } from '@fanatyx/nestjs-observability';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly telemetry: RequestContextService,
  ) {}

  async findById(id: string): Promise<User> {
    return this.telemetry.startSpan('UsersService.findById', async (span) => {
      span.setAttributes({ 'app.user.id': id });

      const user = await this.usersRepository.findOne({ where: { id } });

      if (!user) {
        throw new NotFoundException(`User ${id} not found`);
      }

      span.setAttributes({
        'app.user.username': user.username,
        'app.user.email': user.email,
      });

      return user;
    });
  }

  async create(data: { username: string; email: string }): Promise<User> {
    return this.telemetry.startSpan('UsersService.create', async (span) => {
      span.setAttributes({
        'app.user.username': data.username,
        'app.user.email': data.email,
      });

      const user = this.usersRepository.create(data);
      const saved = await this.usersRepository.save(user);

      span.setAttributes({ 'app.user.id': saved.id });
      span.addEvent('User created successfully');

      return saved;
    });
  }
}
```

### What `startSpan` does for you

You don't need to manage span lifecycle manually. `startSpan` handles:

- **On success** — Sets the span status to `OK` and ends the span
- **On error** — Records the exception on the span, sets status to `ERROR`, ends the span, and **re-throws** the error so your normal error handling still works

For example, when `findById` throws a `NotFoundException`, the span will automatically contain:
- Status: `ERROR`
- An exception event with the error message `"User 123 not found"`

You never need to call `span.end()` or wrap things in try/catch for observability purposes.

## Controller Example

Controllers don't need any changes. HTTP tracing is fully automatic:

```typescript
// src/users/users.controller.ts

import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  create(@Body() body: { username: string; email: string }) {
    return this.usersService.create(body);
  }
}
```

No decorators, no interceptors, no trace-related code. The `TelemetryInterceptor` (registered globally by `TelemetryModule`) handles everything at the HTTP layer. If the request includes a JWT-authenticated user (via `req.user`), the interceptor also adds `app.user.id` and `app.user.username` attributes to the span automatically.

## What You'll See in Jaeger

When you make a `GET /users/1` request, Jaeger will show a trace waterfall like this:

```
user-service: GET /users/1                          [200 OK, 45ms]
├── GET /users/:id                                  [Express route]
│   ├── AppModule.UsersController.findOne           [NestJS handler, 38ms]
│   │   └── UsersService.findById                   [Custom span, 12ms]
│   │       ├── app.user.id = "1"
│   │       ├── app.user.username = "johndoe"
│   │       └── app.user.email = "john@example.com"
```

**What each span represents:**

| Span | Source | Description |
|---|---|---|
| `GET /users/1` | HTTP instrumentation | The top-level HTTP request with method, URL, status code |
| `GET /users/:id` | Express instrumentation | The matched Express route |
| `AppModule.UsersController.findOne` | NestJS instrumentation | The resolved NestJS controller and handler |
| `UsersService.findById` | Your custom span | The database lookup with your custom attributes |

If the request fails (e.g., user not found), the `UsersService.findById` span will show:
- Status: `ERROR`
- Exception event: `NotFoundException: User 1 not found`

The parent HTTP span will show `404 Not Found` as the status code.

## Troubleshooting

### No traces appearing

**Check the collector endpoint.** Verify that `OTEL_EXPORTER_OTLP_ENDPOINT` is set and the collector is reachable:

```bash
# Verify the env var is set
echo $OTEL_EXPORTER_OTLP_ENDPOINT

# Test connectivity to the collector's gRPC port
nc -zv localhost 4317
```

If using Docker Compose, make sure the service name matches what you have in `.env`. For example, if the collector service is named `otel-collector`, the endpoint should be `otel-collector:4317` (not `localhost:4317`).

### Missing early request spans

**You probably forgot the `--require` flag.** Without it, the OpenTelemetry SDK initializes too late — after Node.js has already imported `http` and `express`. Check your start command:

```bash
# Wrong — SDK loads too late
node dist/main.js

# Correct — SDK loads before everything else
node --require ./dist/telemetry/init.js dist/main.js
```

Also make sure you're building the telemetry file:

```bash
# This should produce dist/telemetry/init.js
tsc telemetry/init.ts --outDir dist/telemetry
```

### "Cannot find module" errors for telemetry/init.js

The telemetry file is compiled separately from the NestJS app. Make sure your build script compiles it first:

```json
{
  "scripts": {
    "build": "tsc telemetry/init.ts --outDir dist/telemetry && nest build"
  }
}
```

### Duplicate NestJS class instances or provider errors

This usually means a version mismatch between `@nestjs/core` in your app and the version `@fanatyx/nestjs-observability` was built against. Make sure your NestJS version is >= 10 and check for duplicate packages:

```bash
npm ls @nestjs/core
```

You should see only one version. If you see multiple, try:

```bash
rm -rf node_modules package-lock.json
npm install
```

### Spans missing user information

The `TelemetryInterceptor` reads user data from `req.user`, which is populated by your auth guard. If you're not seeing `app.user.id` or `app.user.username` attributes, verify that:

1. Your auth guard sets `req.user` before the interceptor runs
2. The user object has either `_id` or `sub` (for user ID) and `username` properties

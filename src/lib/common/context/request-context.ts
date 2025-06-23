import { Injectable, Scope } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import * as opentelemetry from '@opentelemetry/api';

@Injectable({ scope: Scope.REQUEST })
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<Map<string, any>>();

  // Get the active OpenTelemetry context
  get activeContext() {
    return opentelemetry.context.active();
  }

  // Get the current active span from the context
  get activeSpan(): opentelemetry.Span | undefined {
    return opentelemetry.trace.getSpan(this.activeContext);
  }

  // Get the tracer to create new spans
  getTracer(name: string, version?: string): opentelemetry.Tracer {
    return opentelemetry.trace.getTracer(name, version);
  }

  /**
   * Runs a function within a new context.
   * This is useful for creating a new context for a specific operation.
   * @param fn The function to execute in the new context.
   * @param context The OpenTelemetry context to set as active.
   */
  withContext<T>(context: opentelemetry.Context, fn: () => T): T {
    return opentelemetry.context.with(context, fn);
  }

  /**
   * Starts a new span and runs a function within its context.
   * This is the primary way you'll create custom spans in your business logic.
   * @param name The name of the span.
   * @param fn The function to execute within the span's context.
   * @param options Span options.
   * @returns The result of the function.
   */
  async startSpan<T>(
    name: string,
    fn: (span: opentelemetry.Span) => Promise<T>,
    options?: opentelemetry.SpanOptions
  ): Promise<T> {
    const tracer = this.getTracer('custom-logic');
    const span = tracer.startSpan(name, options, this.activeContext);

    try {
      const result = await fn(span);
      span.setStatus({ code: opentelemetry.SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: opentelemetry.SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      throw error;
    } finally {
      span.end();
    }
  }
}

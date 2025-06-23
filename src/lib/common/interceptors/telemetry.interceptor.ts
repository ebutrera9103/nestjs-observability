import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { trace, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class TelemetryInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TelemetryInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Get the currently active span created by the GraphQLInstrumentation.
    const activeSpan = trace.getActiveSpan();

    if (activeSpan) {
      // Use our reliable method to get the request object.
      const req = this.getRequest(context);
      const user = req?.user;

      if (user) {
        this.logger.debug(
          `User found, adding attributes to active span: ${user._id}`
        );
        // Add attributes directly to the existing "graphql.resolve" span.
        activeSpan.setAttributes({
          'app.user.id': user._id ?? user.sub,
          'app.user.username': user.username,
        });
      } else {
        this.logger.debug('No user found on request; cannot add to span.');
      }
    } else {
      this.logger.debug('No active OpenTelemetry span found.');
    }

    // We no longer create a new span here, just pass through.
    // We keep the error handling to ensure exceptions are recorded on the active span.
    return next.handle().pipe(
      catchError((err) => {
        if (activeSpan) {
          activeSpan.recordException(err);
          activeSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message,
          });
        }
        return throwError(() => err);
      })
    );
  }

  /**
   * Reliably gets the request object from the execution context.
   */
  private getRequest(context: ExecutionContext): any {
    if (context.getType<any>() === 'graphql') {
      const gqlContextObject = context.getArgByIndex(2);
      return gqlContextObject?.req;
    }
    if (context.getType() === 'http') {
      return context.switchToHttp().getRequest();
    }
    return null;
  }
}

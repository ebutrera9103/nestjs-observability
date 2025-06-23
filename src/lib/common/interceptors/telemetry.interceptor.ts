import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { GraphQLResolveInfo } from 'graphql';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class TelemetryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const handlerName = context.getHandler().name;
    const className = context.getClass().name;

    const tracer = trace.getTracer('nestjs-application');
    const spanName = `${className}.${handlerName}`;

    return tracer.startActiveSpan(spanName, { kind: SpanKind.INTERNAL }, (span) => {
      return next.handle().pipe(
        tap(() => {
          const req = this.getRequest(context);
          const user = req?.user;

          if (user) {
            span.setAttributes({
              'app.user.id': user.sub ?? user.id,
              'app.user.username': user.username,
              'app.user.identityProvider': user.identityProvider?.name ?? 'default',
            });
          } else {
            span.setAttribute('app.user.id', 'anonymous');
          }

          const gqlInfo = this.getGqlInfo(context);

          if (gqlInfo) {
            const gqlContext = GqlExecutionContext.create(context);
            const args = gqlContext.getArgs();

            span.setAttributes({
              'graphql.operation.type': gqlInfo.operation.operation,
              'graphql.operation.name': gqlInfo.operation.name?.value ?? gqlInfo.fieldName,
              'graphql.variables': JSON.stringify(args),
            });
          }

          if (context.getType() === 'http') {
            const res = context.switchToHttp().getResponse();
            span.setAttribute('http.method', req.method);
            span.setAttribute('http.status_code', res.statusCode);

            if (req.route?.path) {
              span.setAttribute('http.route', req.route.path);
            }
          }

          span.setStatus({ code: SpanStatusCode.OK });
        }),
        catchError((err) => {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          span.setAttribute('error', true);
          span.setAttribute('error.message', err.message);

          return throwError(() => err);
        }),
      );
    });
  }

  /**
   * Helper to get the request object from the context.
   */
  private getRequest(context: ExecutionContext): any {
    if (context.getType() === 'http') {
      return context.switchToHttp().getRequest();
    }
    return null;
  }

  /**
   * Safely checks for and returns GraphQL resolve info.
   * In NestJS GraphQL, the `info` object is the 3rd argument (index 2).
   * @returns The GraphQLResolveInfo object or null if it's not a GraphQL context.
   */
  private getGqlInfo(context: ExecutionContext): GraphQLResolveInfo | null {
    const info = context.getArgByIndex(2);
    if (info?.fieldName && info.operation) {
      return info;
    }
    return null;
  }
}

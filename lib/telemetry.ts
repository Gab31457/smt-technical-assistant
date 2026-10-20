import {
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import type {
  Attributes,
  Span,
} from "@opentelemetry/api";

const tracer = trace.getTracer(
  "smt-technical-assistant"
);

export interface TimedOperationResult<T> {
  value: T;
  durationMs: number;
}

export async function runWithSpan<T>(
  spanName: string,
  attributes: Attributes,
  operation: (span: Span) => Promise<T>
): Promise<TimedOperationResult<T>> {
  return tracer.startActiveSpan(
    spanName,
    {
      attributes,
    },
    async (span) => {
      const startedAt = performance.now();

      try {
        const value = await operation(span);
        const durationMs = Math.round(
          performance.now() - startedAt
        );

        span.setAttribute(
          "operation.duration_ms",
          durationMs
        );
        span.setStatus({
          code: SpanStatusCode.OK,
        });

        return {
          value,
          durationMs,
        };
      } catch (error) {
        span.recordException(
          error instanceof Error
            ? error
            : new Error("Ismeretlen műveleti hiba.")
        );
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message:
            error instanceof Error
              ? error.message
              : "Ismeretlen műveleti hiba.",
        });
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

export function setSafeSpanAttributes(
  span: Span,
  attributes: Attributes
): void {
  span.setAttributes(attributes);
}

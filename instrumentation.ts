import { registerOTel } from "@vercel/otel";

export function register(): void {
  registerOTel({
    serviceName: "smt-technical-assistant",
  });
}

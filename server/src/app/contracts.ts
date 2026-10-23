import type { IncomingHttpHeaders } from 'node:http';

// Transport input: no framework request, socket, raw response or client owner.
export interface RequestInput {
    body: unknown;
    params: Record<string, string>;
    query: Record<string, unknown>;
    headers: IncomingHttpHeaders;
    ip: string;
    path: string;
    requestId: string;
    method?: string;
    userId?: string;
}
export interface HttpResult { status: number; headers: Record<string, string>; body: unknown }
// Existing controllers use this deliberately small output port. It collects a
// value; only the transport adapter sends bytes. No Express middleware is run.
export class ResponseOutput {
    readonly result: HttpResult = { status: 200, headers: {}, body: undefined };
    sent = false;
    status(code: number): this { this.result.status = code; return this; }
    set(name: string, value: string): this { this.result.headers[name] = value; return this; }
    json(body: unknown): this {
        if (this.sent) throw new Error('Response already completed');
        this.sent = true; this.result.body = body; return this;
    }
}
export type Controller = (input: RequestInput, output: ResponseOutput) => unknown | Promise<unknown>;
export interface RatePolicy { windowMs?: number; max?: number; keyFn?: (input: RequestInput) => string }
export type Guard = { kind: 'auth' } | { kind: 'rate'; policy: RatePolicy };
export interface RouteDefinition {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; domain: string;
    guards: Guard[]; handler: Controller;
}

import type { RuntimeConfig } from '../../app/runtime.js';
import type { HttpResult, RequestInput } from '../../app/contracts.js';
export interface WebSessions {
    resolve(input: RequestInput): HttpResult | { authorization?: string };
    exchange(input: RequestInput): HttpResult; inspect(input: RequestInput): HttpResult; logout(input: RequestInput): HttpResult; clear(): void;
}
export function createWebSessions(config: RuntimeConfig): WebSessions;

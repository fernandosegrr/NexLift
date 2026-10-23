import type { RuntimeConfig } from './runtime.js';
export function trustedProxy(value?: string): (address: string) => boolean;
export function securityHeaders(config: RuntimeConfig): Record<string, string>;
export function privateApi(pathname: string): boolean;

import type { PrismaClient } from '@prisma/client';
import type { HttpResult } from '../../app/contracts.js';
export type AuthDecision = HttpResult | { userId: string };
export function createAuthenticator(options: { prisma: PrismaClient; secret: string; log?: (entry: Record<string, unknown>) => void }):
    (input: { authorization: string | undefined; requestId: string }) => Promise<AuthDecision>;

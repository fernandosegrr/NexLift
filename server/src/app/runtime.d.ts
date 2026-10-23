import type { PrismaClient } from '@prisma/client';
import type { WebSessions } from '../modules/auth/webSessions.js';
export interface RuntimeConfig {
    jwtSecret: string; nodeEnv: string; corsOrigin?: string; staticRoot?: string;
    offlineSyncEnabled?: boolean; resolutionEnabled?: boolean; vapidPublicKey?: string; backupPruneEnabled?: boolean;
    trustedProxyCidrs?: string; cspEnforce?: boolean; webSessionEnabled?: boolean; webOrigin?: string;
}
export interface RuntimeServices {
    prisma: PrismaClient; JWT_SECRET: string; HISTORY_SESSIONS_WINDOW: number;
    CLOUDINARY_CONFIGURED: boolean; VAPID_CONFIGURED: boolean; config: RuntimeConfig;
    webSessions: WebSessions;
}
export interface ApplicationRuntime {
    services: RuntimeServices; prisma: PrismaClient; config: RuntimeConfig;
    isClosing(): boolean; markClosing(): void; startBackground(): Promise<void>; stopBackground(): Promise<void>;
}
export function createRuntime(options: { prisma: PrismaClient; config: RuntimeConfig; providers: Record<string, unknown> }): ApplicationRuntime;

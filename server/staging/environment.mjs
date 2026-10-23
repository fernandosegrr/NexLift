import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';

export const secret = () => randomBytes(32).toString('hex');
export function stageHome(env = process.env) {
    const home = env.NEXLIFT_STAGE_HOME || path.join(env.LOCALAPPDATA || path.join(os.homedir(), '.local/share'), 'NexLift', 'staging-v4');
    if (!path.isAbsolute(home)) throw new Error('Staging requires an absolute private directory');
    return path.resolve(home);
}
export function cleanStageEnvironment(env = process.env) {
    return Object.fromEntries(Object.entries(env).filter(([key]) =>
        /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|HOME|NEXLIFT_TEST_PG_BIN)$/i.test(key)));
}
export function databaseURL(state, name, role = 'admin') {
    if (!Object.hasOwn(state.databases, name) || !Object.hasOwn(state.credentials, role)) throw new Error('Unregistered staging target');
    const credential = state.credentials[role];
    const url = new URL(`postgresql://127.0.0.1:${state.pgPort}/${state.databases[name].name}`);
    url.username = credential.user; url.password = credential.password;
    url.searchParams.set('connect_timeout', '3'); url.searchParams.set('pool_timeout', '3');
    return url.href;
}
export function runtimeEnvironment(state, root, database = 'runtime') {
    return { ...cleanStageEnvironment(), NODE_ENV: 'production', NEXLIFT_INFRA_REHEARSAL: 'true',
        NEXLIFT_RELEASE_DATABASE_URL: databaseURL(state, database, 'app'), JWT_SECRET: state.jwtSecret,
        PORT: String(state.httpPort), NEXLIFT_BIND_HOST: '127.0.0.1', NEXLIFT_STAGE_HOME: root,
        // No provider, proxy, NODE_OPTIONS, .env or production credentials inherited.
        OPENAI_API_KEY: '', CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '',
        VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', NEXLIFT_BACKUP_PRUNE_ENABLED: 'false' };
}
